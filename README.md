
# Simple BIP44 HD wallet for the command line.

node.js command line bitcoin HD wallet, BIP 44 compatible.

## Requirements

### NPM modules

Install several npm modules for node.js:

	$ npm install async commander bitcore-lib bitcore-mnemonic bitcoind-rpc bitcore-p2p

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

	$ ./wal.js --help

## Wallet operations

### Create new wallet

	$ export WAL_SECRET="this is my secret encryption passphrase"
	$ ./wal.js --create

### Check wallet integrity

	$ ./wal.js --check

## Account operations

### Create new named account

	$ ./wal.js --accountNew NAME

### Set default account

	$ ./wal.js --accountDefault NAME

### List accounts and balances

	$ ./wal.js --accountList

### Generate new bitcoin address from default account

	$ ./wal.js --addressNew

### List wallet transactions

	$ ./wal.js --txList

### Sync with network, detect new bitcoin payments

	$ ./wal.js --syncHeaders
	$ ./wal.js --scanBlocks

### Spend bitcoins

	$ cat spend.json	# Spend 0.001 BTC from master acct
	{
		"account": "master",
		"to": {
			"address": "16LTKenxcNMqgp2x2u9UCDSGjiWzXEr2va",
			"btc": 0.001
		}
	}
	$ ./wal.js --spend spend.json

