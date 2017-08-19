
# bitcoind Compatibility Chart

Done? | Compat? | RPC name | Params
----- | ------- | -------- | ------
no | yes | abandontransaction | "txid"
no | yes | addmultisigaddress | nrequired ["key",...] ( "account" )
no | yes | addwitnessaddress | "address"
no | yes | backupwallet | "destination"
no | yes | bumpfee | "txid" ( options ) 
no | yes | dumpprivkey | "address"
no | yes | dumpwallet | "filename"
yes | yes | getaccount | "address"
yes | yes | getaccountaddress | "account"
no | yes | getaddressesbyaccount | "account"
no | yes | getbalance | ( "account" minconf include_watchonly )
no | yes | getnewaddress | ( "account" )
no | yes | getrawchangeaddress
no | yes | getreceivedbyaccount | "account" ( minconf )
no | yes | getreceivedbyaddress | "address" ( minconf )
no | yes | gettransaction | "txid" ( include_watchonly )
no | yes | getunconfirmedbalance
no | yes | getwalletinfo
no | yes | importaddress | "address" ( "label" rescan p2sh )
no | yes | importmulti | "requests" "options"
no | yes | importprivkey | "bitcoinprivkey" ( "label" ) ( rescan )
no | yes | importprunedfunds
no | yes | importpubkey | "pubkey" ( "label" rescan )
no | yes | importwallet | "filename"
no | yes | keypoolrefill | ( newsize )
50% | yes | listaccounts | ( minconf include_watchonly)
no | yes | listaddressgroupings
no | yes | listlockunspent
no | yes | listreceivedbyaccount | ( minconf include_empty include_watchonly)
no | yes | listreceivedbyaddress | ( minconf include_empty include_watchonly)
no | yes | listsinceblock | ( "blockhash" target_confirmations include_watchonly)
no | yes | listtransactions | ( "account" count skip include_watchonly)
no | yes | listunspent | ( minconf maxconf  ["addresses",...] [include_unsafe] )
no | yes | lockunspent | unlock ([{"txid":"txid","vout":n},...])
no | yes | move | "fromaccount" "toaccount" amount ( minconf "comment" )
no | yes | removeprunedfunds | "txid"
no | yes | sendfrom | "fromaccount" "toaddress" amount ( minconf "comment" "comment_to" )
no | yes | sendmany | "fromaccount" {"address":amount,...} ( minconf "comment" ["address",...] )
no | yes | sendtoaddress | "address" amount ( "comment" "comment_to" subtractfeefromamount )
no | yes | setaccount | "address" "account"
no | yes | settxfee | amount
yes | yes | signmessage | "address" "message"
no | yes | walletlock
no | yes | walletpassphrase | "passphrase" timeout
no | yes | walletpassphrasechange | "oldpassphrase" "newpassphrase"

