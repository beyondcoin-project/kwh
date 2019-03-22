/** @format */

import browser from 'webextension-polyfill'
import React, {useState, useEffect, useContext} from 'react' // eslint-disable-line
import friendlyTime from 'friendly-time'

import {CurrentContext} from '../popup'
import {msatsFormat} from '../utils'

export default function Home() {
  let {tab} = useContext(CurrentContext)

  let [invoices, setInvoices] = useState([])
  let [payments, setPayments] = useState([])
  let [nodeInfo, setNodeInfo] = useState({})
  let [balance, setBalance] = useState(0)
  let [authorized, setAuthorized] = useState({})

  useEffect(() => {
    browser.runtime
      .sendMessage({tab, rpc: true, method: 'getinfo'})
      .then(({blockheight, id, alias, color, address}) => {
        address =
          address.length === 0
            ? null
            : `${address[0].address}:${address[0].port}`
        setNodeInfo({blockheight, id, alias, color, address})
      })
    browser.runtime
      .sendMessage({tab, rpc: true, method: 'listfunds'})
      .then(({channels}) => {
        let balance = channels.reduce((acc, ch) => acc + ch.channel_sat, 0)
        setBalance(balance)
      })
    browser.runtime
      .sendMessage({tab, rpc: true, method: 'listinvoices'})
      .then(resp => {
        setInvoices(resp.invoices.filter(inv => inv.status === 'paid'))
      })
    browser.runtime
      .sendMessage({tab, rpc: true, method: 'listpayments'})
      .then(resp => {
        setPayments(resp.payments.filter(pay => pay.status === 'complete'))
      })
    browser.runtime.sendMessage({tab, getAuthorized: true}).then(setAuthorized)
  }, [])

  let transactions = invoices
    .map(({paid_at, expires_at, msatoshi, description = ''}) => ({
      date: paid_at || expires_at,
      amount: msatoshi,
      description
    }))
    .slice(-15)
    .concat(
      payments
        .map(({created_at, msatoshi, description, payment_preimage}) => ({
          date: created_at,
          amount: -msatoshi,
          description: description || payment_preimage
        }))
        .slice(-15)
    )
    .sort((a, b) => a.date - b.date)
    .slice(-15)
    .reverse()

  function deauthorize(e) {
    e.preventDefault()
    let domain = e.target.dataset.domain
    browser.storage.local.get('authorized').then(({authorized}) => {
      delete authorized[domain]
      return browser.storage.local.set({authorized}).then(() => {
        setAuthorized(authorized)
      })
    })
  }

  return (
    <div>
      <h1 className="f6 ma3">Balance</h1>
      <div className="f5 tc dark-pink b">{balance} satoshis</div>
      <h1 className="f6 ma3">Latest transactions</h1>
      <div className="flex justify-center">
        <table className="f">
          <tbody>
            {transactions.map((tx, i) => (
              <tr key={i} className="bg-light-yellow hover-bg-light-pink">
                <td className="pa1 f7">{formatDate(tx.date)}</td>
                <td
                  className={
                    'code tr pa1 f7 ' + (tx.amount < 0 ? 'dark-pink' : 'green')
                  }
                >
                  {msatsFormat(tx.amount)}
                </td>
                <td className="pa1 f7" title={tx.description}>
                  {tx.description.length > 17
                    ? tx.description.slice(0, 16) + '…'
                    : tx.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h1 className="f6 ma3">Node</h1>
      <div>
        <table>
          <tbody>
            {['alias', 'id', 'address', 'blockheight'].map(attr => (
              <tr key={attr}>
                <td className="lh-title b tr dark-pink">{attr}</td>
                <td className="wrap code lh-copy">{nodeInfo[attr]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h1 className="f6 ma3">Enabled domains</h1>
      <div>
        <table>
          <tbody>
            {Object.keys(authorized)
              .map(domain => [domain, authorized[domain]])
              .map(([domain, _]) => (
                <tr key={domain}>
                  <td className="lh-title b tr dark-pink">{domain}</td>
                  <td>
                    <button
                      className="di bg-animate bg-light-gray bn button-reset f7 hover-bg-dark-gray pa1 pointer gray hover-white"
                      onClick={deauthorize}
                      data-domain={domain}
                    >
                      disable
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const now = Date.now()
function formatDate(timestamp) {
  let date = new Date(timestamp * 1000)
  if (timestamp * 1000 + 86400 * 1000 * 2 < now) {
    return date.toISOString().split('T')[0]
  }

  return friendlyTime(date)
}