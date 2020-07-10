/** @format */

import cuid from 'cuid'
import createHmac from 'create-hmac'

import {getRpcParams, backoff, normalizeURL} from '../utils'
import {INVOICE_EXPIRY_SECONDS} from '../constants'

const fetch = window.fetch
const EventSource = window.EventSource

export function getInfo() {
  return rpcCall('getinfo').then(({id, alias, color}) => ({id, alias, color}))
}

export function summary() {
  return Promise.all([
    rpcCall('getinfo').then(({blockheight, id, alias, color, address}) => {
      address =
        address.length === 0 ? null : `${address[0].address}:${address[0].port}`

      return {blockheight, id, alias, color, address}
    }),
    rpcCall('listfunds').then(({channels}) => {
      return channels.reduce((acc, ch) => acc + ch.channel_sat, 0)
    }),
    rpcCall('listinvoices').then(({invoices}) => {
      return invoices.filter(inv => inv.status === 'paid')
    }),
    rpcCall('listpayments').then(({payments}) => {
      return payments.filter(pay => pay.status === 'complete')
    })
  ]).then(([info, balance, invoices, payments]) => {
    let transactions = invoices
      .map(({paid_at, expires_at, msatoshi, description = ''}) => ({
        date: paid_at || expires_at,
        amount: msatoshi,
        description
      }))
      .slice(-15)
      .concat(
        payments
          .map(
            ({
              created_at,
              msatoshi,
              msatoshi_sent,
              description,
              payment_preimage
            }) => ({
              date: created_at,
              amount: -msatoshi,
              description: description || payment_preimage,
              fees: msatoshi_sent - msatoshi
            })
          )
          .slice(-15)
      )
      .sort((a, b) => b.date - a.date)
      .slice(0, 15)

    return {info, balance, transactions}
  })
}

export function pay(bolt11, msatoshi, description = 'unnamed kWh-BYND invoice') {
  if (!msatoshi) msatoshi = undefined

  return rpcCall('pay', {
    bolt11,
    msatoshi,
    label: description
  }).then(({payment_preimage, msatoshi, msatoshi_sent}) => ({
    msatoshi_paid: msatoshi_sent,
    msatoshi_fees: msatoshi_sent - msatoshi,
    preimage: payment_preimage
  }))
}

export function decode(bolt11) {
  return rpcCall('decodepay', [bolt11]).then(
    ({description, msatoshi, payee, payment_hash, expiry, created_at}) => ({
      description,
      msatoshi,
      nodeid: payee,
      hash: payment_hash,
      creation: created_at,
      expiry
    })
  )
}

export function makeInvoice(msatoshi = 'any', description, label = undefined) {
  if (!label) label = `kWh-BYND.${cuid.slug()}`
  return rpcCall('invoice', {
    msatoshi,
    label,
    description,
    expiry: INVOICE_EXPIRY_SECONDS
  }).then(({bolt11, payment_hash}) => ({bolt11, hash: payment_hash}))
}

var es
var currentES

export function cleanupListener() {
  if (currentES && currentES.readyState === EventSource.OPEN) currentES.close()
}

export function listenForEvents(defaultCallback, errcount = 0) {
  return backoff(() => {
    var isFulfilled = false

    return getRpcParams().then(
      ({kind, endpoint, username, password}) => {
        if (kind !== 'lightningd_spark') return null

        return new Promise((resolve, reject) => {
          const es = new EventSource(
            normalizeURL(endpoint) +
              '/stream?access-key=' +
              makeAccessKey(username, password)
          )

          es.onopen = () => {
            // if it's open for 2 seconds consider it a success
            setTimeout(() => {
              resolve(es)
            }, 2000)
          }

          es.addEventListener('inv-paid', ev => {
            try {
              let {description, msatoshi_received, payment_hash} = JSON.parse(
                ev.data
              )

              // here we send normalized data, not the raw event
              defaultCallback('payment-received', {
                amount: msatoshi_received,
                description,
                hash: payment_hash
              })
            } catch (e) {
              console.log('failed to parse inv-paid event', ev)
              return
            }
          })

          es.onerror = ev => {
            console.log('error on eventsource', ev)

            if (!isFulfilled) {
              // fail and let backoff retry
              reject()
            } else {
              // otherwise we trigger an internal retry
              listenForEvents(defaultCallback)
              // if it succeeds this will just replace
              // currentES so cleanupListener will always work.
            }
          }
        }).then(ws => {
          if (ws) {
            cleanupListener() // clear current if there's one
            currentES = es // assign new
            return true
          }

          return false
        })
      },
      10,
      10
    )
  })
}

function rpcCall(method, params = []) {
  return getRpcParams().then(({endpoint, username, password}) => {
    return fetch(normalizeURL(endpoint) + '/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'kwh-bynd-extension',
        'X-Access': makeAccessKey(username, password)
      },
      body: JSON.stringify({method, params})
    })
      .then(r => r.json())
      .then(res => {
        if (res.code) {
          throw new Error(res.message || res.code)
        }

        return res
      })
  })
}

function makeAccessKey(username, password) {
  return createHmac('sha256', `${username}:${password}`)
    .update('access-key')
    .digest('base64')
    .replace(/\W+/g, '')
}
