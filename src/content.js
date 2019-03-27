/** @format */

import browser from 'webextension-polyfill'

const Keysim = require('keysim')

import {PROMPT_PAYMENT, REQUEST_GETINFO} from './constants'
import {getOriginData, sprint} from './utils'

if (document) {
  // intercept any `lightning:` links
  document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('click', ev => {
      let target = ev.target
      if (!target || !target.closest) {
        return
      }

      let lightningLink = target.closest('[href^="lightning:"]')
      if (lightningLink) {
        let href = lightningLink.getAttribute('href')
        let invoice = href.replace('lightning:', '')
        browser.runtime.sendMessage({
          setAction: {
            type: PROMPT_PAYMENT,
            origin: getOriginData(),
            invoice
          }
        })
        ev.preventDefault()
      }
    })
  })

  // listen for right-click events to show the context menu item
  // when a potential lightning invoice is selected.
  // also works for numeric amounts that get passed to the generate
  // invoice context menu.
  document.addEventListener(
    'mousedown',
    event => {
      // 2 = right mouse button
      if (event.button === 2) {
        var invoice = window.getSelection().toString()
        // if nothing selected, try to get the text of the right-clicked element.
        if (!invoice && event.target) {
          let target = event.target
          invoice = target.innerText || target.value
        }
        if (invoice) {
          // send message to background script to toggle the context menu item
          // based on the content of the right-clicked text
          browser.runtime.sendMessage({
            contextMenu: true,
            text: invoice
          })
        }
      }
    },
    true
  )

  // respond to all messages (because apparently content scripts can
  // only have one onMessage handler)
  browser.runtime.onMessage.addListener(
    ({getOrigin, paste, elementId, bolt11}) => {
      if (paste) {
        // paste invoices on specific input fields
        let el = elementId
          ? browser.contextMenu.getTargetElement(elementId)
          : document.activeElement

        el.focus()

        let keyboard = Keysim.Keyboard.US_ENGLISH
        el.value = bolt11
        keyboard.dispatchEventsForInput(bolt11, el)
      } else if (getOrigin) {
        // return tab data to background page
        return Promise.resolve(getOriginData())
      }
    }
  )

  // insert webln
  var script = document.createElement('script')
  script.src = browser.runtime.getURL('webln-bundle.js')
  ;(document.head || document.documentElement).appendChild(script)

  // communicate with webln
  var _blocked = null
  window.addEventListener('message', ev => {
    // only accept messages from the current window
    if (ev.source !== window) return
    if (!ev.data || ev.data.application !== 'KwH' || ev.data.response) return

    let origin = getOriginData()

    let {type, ...extra} = ev.data
    let action = {
      ...extra,
      type,
      origin
    }

    Promise.resolve()
      .then(() => {
        if (ev.data.getBlocked) {
          // return blocked status for this site
          if (_blocked !== null) return _blocked

          return browser.runtime
            .sendMessage({
              getBlocked: true,
              domain: origin.domain
            })
            .then(blocked => {
              _blocked = blocked
              return blocked
            })
        } else {
          // default: an action or prompt
          console.log(`[KwH]: ${type} ${sprint(extra)} ${sprint(origin)}`)

          switch (type) {
            case REQUEST_GETINFO:
              return browser.runtime.sendMessage({
                rpc: true,
                method: 'getinfo'
              })
            default:
              return null
          }
        }
      })
      .then(earlyResponse => {
        if (earlyResponse !== null && earlyResponse !== undefined) {
          // we have a response already. end here.
          return earlyResponse
        } else {
          // proceed to call the background page
          // and prompt the user if necessary
          return browser.runtime.sendMessage({setAction: action})
        }
      })
      .then(response => {
        window.postMessage(
          {response: true, application: 'KwH', data: response},
          '*'
        )
      })
      .catch(err => {
        window.postMessage(
          {response: true, application: 'KwH', error: err},
          '*'
        )
      })
  })
}
