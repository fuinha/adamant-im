import coininfo from 'coininfo'
import bitcoin from 'bitcoinjs-lib'
import axios from 'axios'

import { Cryptos } from './constants'
import getEnpointUrl from './getEndpointUrl'

const fmt = coininfo.dogecoin.main.toBitcoinJS()
const network = {
  messagePrefix: '\x19' + fmt.name + ' Signed Message:\n',
  bip32: {
    public: fmt.bip32.public,
    private: fmt.bip32.private
  },
  pubKeyHash: fmt.pubKeyHash,
  scriptHash: fmt.scriptHash,
  wif: fmt.wif
}

const getUnique = values => {
  const map = values.reduce((m, v) => {
    m[v] = 1
    return m
  }, { })
  return Object.keys(map)
}

export const MULTIPLIER = 1e8
export const TX_FEE = 1 // 1 DOGE per transaction
export const CHUNK_SIZE = 20

export default class DogeApi {
  constructor (passphrase) {
    const pwHash = bitcoin.crypto.sha256(Buffer.from(passphrase))
    this._keyPair = bitcoin.ECPair.fromPrivateKey(pwHash, { network })
    this._address = bitcoin.payments.p2pkh({ pubkey: this._keyPair.publicKey, network }).address
    this._clients = { }

    this._mapTransaction = this._mapTransaction.bind(this)
  }

  /** Dogecoin public address */
  get address () {
    return this._address
  }

  /**
   * Returns confirmed Doge balance
   * @returns {Promise<string>}
   */
  getBalance () {
    return this._get(`/addr/${this.address}/balance`)
      .then(balance => Number(balance) / MULTIPLIER)
  }

  /**
   * Creates a DOGE transfer transaction hex and ID
   * @param {string} address receiver address
   * @param {number} amount amount to transfer (DOGEs)
   * @returns {Promise<{hex: string, txid: string}>}
   */
  createTransaction (address = '', amount = 0) {
    amount = Math.floor(Number(amount) * MULTIPLIER)

    return this._get(`/addr/${this.address}/utxo?noCache=1`)
      .then(unspents => {
        const hex = this._buildTransaction(address, amount, unspents)

        let txid = bitcoin.crypto.sha256(Buffer.from(hex, 'hex'))
        txid = bitcoin.crypto.sha256(Buffer.from(txid))
        txid = txid.toString('hex').match(/.{2}/g).reverse().join('')

        return { hex, txid }
      })
  }

  /**
   * Broadcasts the specified transaction to the DOGE network.
   * @param {string} txHex raw transaction as a HEX literal
   */
  sendTransaction (txHex) {
    return this._post('/tx/send', { rawtx: txHex })
  }

  /**
   * Retrieves transaction details
   * @param {*} txid transaction ID
   * @returns {Promise<object>}
   */
  getTransaction (txid) {
    return this._get(`tx/${txid}`).then(this._mapTransaction)
  }

  /**
   * Retrieves transactions for the specified address
   * @param {number=} from retrieve transactions starting from the specified position
   * @returns {Promise<{hasMore: boolean, items: Array}>}
   */
  getTransactions (from = 0) {
    const to = from + CHUNK_SIZE
    return this._get(`/addrs/${this.address}/txs`, { from, to })
      .then(resp => ({
        ...resp,
        hasMore: to < resp.totalItems,
        items: resp.items.map(this._mapTransaction)
      }))
  }

  /**
   * Creates a raw DOGE transaction as a hex string.
   * @param {string} address target address
   * @param {number} amount amount to send
   * @param {Array<{txid: string, amount: number}>} unspents unspent transaction to use as inputs
   * @returns {string}
   */
  _buildTransaction (address, amount, unspents) {
    const txb = new bitcoin.TransactionBuilder(network)
    txb.setVersion(1)

    const target = (amount + TX_FEE) * MULTIPLIER
    let transferAmount = 0
    let inputs = 0

    unspents.forEach(tx => {
      const amount = Math.floor(tx.amount * MULTIPLIER)
      if (transferAmount < target) {
        txb.addInput(tx.txid, inputs++)
        transferAmount += amount
      }
    })

    txb.addOutput(address, amount)
    txb.addOutput(this._address, transferAmount - target)

    for (let i = 0; i < inputs; ++i) {
      txb.sign(i, this._keyPair)
    }

    return txb.build().toHex()
  }

  /** Executes a GET request to the DOGE API */
  _get (url, params) {
    return this._getClient().get(url, params).then(response => response.data)
  }

  /** Executes a POST request to the DOGE API */
  _post (url, data) {
    const fd = Object.keys(data).reduce((form, key) => {
      form.append(key, data[key])
      return form
    }, new FormData())

    return this._getClient().post(url, fd).then(response => response.data)
  }

  /** Picks a client for a random DOGE API endpoint */
  _getClient () {
    const url = getEnpointUrl(Cryptos.DOGE)
    if (!this._clients[url]) {
      this._clients[url] = axios.create({
        baseURL: url
      })
    }
    return this._clients[url]
  }

  _mapTransaction (tx) {
    const senders = getUnique(tx.vin.map(x => x.addr))
    const senderId = senders.length === 1 ? senders[0] : null

    const direction = senders.includes(this._address) ? 'from' : 'to'

    const recipients = getUnique(tx.vout.reduce((list, out) => {
      list.push(...out.scriptPubKey.addresses)
      return list
    }, []))

    if (direction === 'from') {
      // Disregard our address for the outgoing transaction
      const idx = recipients.indexOf(this._address)
      if (idx >= 0) recipients.splice(idx, 1)
    }
    const recipientId = recipients.length === 1 ? recipients[0] : null

    // Calculate amount from outputs:
    // * for the outgoing transactions take outputs that DO NOT target us
    // * for the incoming transactions take ouputs that DO target us
    let amount = tx.vout.reduce((sum, t) =>
      ((direction === 'to') === (t.scriptPubKey.addresses.includes(this._address)) ? sum + Number(t.value) : sum), 0)

    const confirmations = tx.confirmations
    const timestamp = tx.time * 1000

    return {
      id: tx.txid,
      hash: tx.txid,
      fee: tx.fees || TX_FEE,
      status: confirmations > 0 ? 'SUCCESS' : 'PENDING',
      timestamp,
      direction,
      senders,
      senderId,
      recipients,
      recipientId,
      amount,
      confirmations
    }
  }
}
