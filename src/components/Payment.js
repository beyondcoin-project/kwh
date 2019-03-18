/** @format */

import browser from 'webextension-polyfill'
import React, {useState, useEffect} from 'react' // eslint-disable-line
import AutosizeInput from 'react-input-autosize'

import ShowInvoice from './ShowInvoice'

export default function Payment({invoice}) {
  let [bolt11, setBolt11] = useState(invoice || '')
  let [doneTyping, setDoneTyping] = useState(!!invoice)

  let [invoiceData, setInvoiceData] = useState(null)
  let [satoshiActual, setSatoshiActual] = useState(0)
  let [paymentPending, setPaymentPending] = useState(false)

  useEffect(
    () => {
      if (bolt11 === '' || doneTyping === false) return

      browser.runtime
        .sendMessage({rpc: true, method: 'decodepay', params: [invoice]})
        .then(data => {
          setInvoiceData(data)
        })
    },
    [doneTyping]
  )

  function typedInvoice(e) {
    e.preventDefault()
    setDoneTyping(true)
  }

  function sendPayment(e) {
    e.preventDefault()

    browser.runtime
      .sendMessage({
        rpc: true,
        method: 'pay',
        params: {bolt11: invoice, msatoshi: satoshiActual || undefined},
        behaviors: {
          success: ['notify-payment-success', 'navigate-home'],
          failure: ['notify-payment-error', 'navigate-home']
        }
      })
      .then(() => {
        setPaymentPending(false)
      })

    setPaymentPending(true)
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
    <div className="w-100">
      {invoiceData && (
        <div className="lh-copy">
          Pay{' '}
          {invoiceData.msatoshi ? (
            <span className={valueClasses}>
              {(invoiceData.msatoshi / 1000).toFixed(3)}
            </span>
          ) : (
            <AutosizeInput
              type="number"
              className={valueClasses + ' bg-transparent w3'}
              value={satoshiActual}
              onChange={e => setSatoshiActual(e.target.value)}
              step="10"
              min="1"
              max={Infinity}
            />
          )}{' '}
          to{' '}
          <span className="dark-pink hover-gold code b f6">
            {invoiceData.payee.slice(0, 4)}…{invoiceData.payee.slice(-4)}
          </span>
          {invoiceData.description ? (
            <>
              {' '}
              for{' '}
              <span className="dark-pink hover-gold code b f6">
                {invoiceData.description}
              </span>
            </>
          ) : (
            ''
          )}
          ?
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
      <ShowInvoice invoice={invoice} />
    </div>
  )
}
