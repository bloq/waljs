
# Simple BIP44 HD wallet for the command line.

node.js command line bitcoin HD wallet, BIP 44 compatible.

## Requirements and install

First clone the repository and install the dependencies using the next commands:

```BASH
$ npm install
$ sudo npm link
```

Now you are ready for use it globally:

```BASH
$ waljs
```

### Full node

A full node, BloqEnterprise router or bitcoind, is required to
transmit transactions to the network.

RPC credentials are stored in rpc-info.json:

	{
		"protocol": "http",
		"user": "myusername",
		"pass": "mysecretPassword",
		"host": "127.0.0.1",
		"port": "8332"
	}

The wallet will contact 127.0.0.1 port 8333 for P2P header & block requests.

## Help

For commands and options, run

	$ waljs --help

## Wallet operations

### Create new wallet

	$ export WAL_SECRET="this is my secret encryption passphrase"
	$ waljs --create

### Check wallet integrity

	$ waljs --check

## Account operations

### Create new named account

	$ waljs --accountNew NAME

### Set default account

	$ waljs --accountDefault NAME

### List accounts and balances

	$ waljs --accountList

### Generate new bitcoin address from default account

	$ waljs --addressNew

### List wallet transactions

	$ waljs --txList

### Sync with network, detect new bitcoin payments

	$ waljs --syncHeaders
	$ waljs --scanBlocks

### Spend bitcoins

	$ cat spend.json	# Spend 0.001 BTC from master acct
	{
		"account": "master",
		"to": {
			"address": "16LTKenxcNMqgp2x2u9UCDSGjiWzXEr2va",
			"btc": 0.001
		}
	}
	$ waljs --spend spend.json

