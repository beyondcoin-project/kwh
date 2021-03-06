/** @format */

import browser from 'webextension-polyfill'
import React, {useState, useEffect, useContext} from 'react' // eslint-disable-line

import {CurrentContext} from '../popup'
import {formatmsat, abbreviate} from '../utils'

export default function Payment() {
  let {action, tab} = useContext(CurrentContext)

  let [bolt11, setBolt11] = useState(action.invoice || '')
  let [doneTyping, setDoneTyping] = useState(!!action.invoice)
  let [paymentPending, setPaymentPending] = useState(!!action.pending)

  let [invoiceData, setInvoiceData] = useState(null)
  let [satoshiActual, setSatoshiActual] = useState(0)

  let [iconShown, showIcon] = useState(false)

  useEffect(
    () => {
      if (bolt11 === '' || doneTyping === false || paymentPending) return

      browser.runtime
        .sendMessage({tab, rpc: {decode: [bolt11]}})
        .then(data => {
          setInvoiceData(data)
        })
        .catch(err => console.log('error', err))
    },
    [bolt11, doneTyping]
  )

  function handleIconLoaded() {
    showIcon(true)
  }

  function typedInvoice(e) {
    e.preventDefault()
    setDoneTyping(true)
  }

  function sendPayment(e) {
    e.preventDefault()

    // set pending
    setPaymentPending(true)
    browser.runtime.sendMessage({
      tab,
      triggerBehaviors: true,
      behaviors: ['save-pending-to-current-action']
    })

    // actually send payment
    browser.runtime
      .sendMessage({
        tab,
        rpc: {
          pay: [
            bolt11,
            satoshiActual ? satoshiActual * 1000 : undefined,
            invoiceData.description
          ]
        },
        behaviors: {
          success: [
            'notify-payment-success',
            'return-preimage',
            'navigate-home'
          ],
          failure: [
            'notify-payment-error',
            'return-payment-error',
            'navigate-home'
          ]
        }
      })
      .then(() => {
        setPaymentPending(false)
        window.close()
      })
      .catch(() => {
        window.close()
      })
  }

  if (paymentPending) {
    return (
      <div className="flex justify-center content-center items-center ma3">
        <div className="b dark-pink">sending payment…</div>
      </div>
    )
  }

  if (!doneTyping) {
    return (
      <div>
        <textarea
          className="w-100 h5 pa2 code"
          value={bolt11}
          onChange={e => {
            setBolt11(e.target.value)
          }}
          placeholder="Paste bolt11 invoice here."
        />
        <div className="flex justify-end">
          <button
            onClick={typedInvoice}
            className="db bg-animate bg-light-pink bn button-reset f6 hover-bg-gold ma2 p2 pa2 pointer white"
          >
            Ok
          </button>
        </div>
      </div>
    )
  }

  let valueClasses = 'dark-pink hover-gold code b f6'

  return (
    <div className="lh-copy wrap tj measure w5 pa2">
      {action.origin && (
        <div className="flex items-center content-center justify-center pb2">
          <div className="ma1 f7">
            Sending a payment on <span className="b">{action.origin.name}</span>
          </div>
          <img
            src={action.origin.icon}
            className="ma1 h3"
            onLoad={handleIconLoaded}
            style={{display: iconShown ? 'block' : 'none'}}
          />
        </div>
      )}
      {invoiceData && (
        <div>
          Pay{' '}
          {invoiceData.msatoshi ? (
            <span className={valueClasses}>
              {formatmsat(invoiceData.msatoshi)}
            </span>
          ) : (
            <input
              className={valueClasses + ' ml1 mr1 bn bg-transparent w3'}
              value={satoshiActual}
              onChange={e => setSatoshiActual(e.target.value)}
              step="10"
              min="100"
              max={Infinity}
            />
          )}{' '}
          to{' '}
          <span className="dark-pink hover-gold code b f6">
            {abbreviate(invoiceData.nodeid)}
          </span>
          {invoiceData.description && (
            <>
              {' '}
              by occasion of{' '}
              <span className="dark-pink hover-gold code b f6">
                {invoiceData.description}
              </span>
            </>
          )}{' '}
          in exchange for the preimage of{' '}
          <span className="dark-pink hover-gold code b f6">
            {abbreviate(invoiceData.hash)}
          </span>
          . ?
          <div className="flex justify-end">
            <button
              onClick={sendPayment}
              className="db bg-animate bg-light-pink bn button-reset f6 hover-bg-gold ma2 p2 pa2 pointer white"
            >
              Pay
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
