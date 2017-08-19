
# Simple BIP44 HD wallet for the command line.

node.js bitcoin HD wallet service, bitcoind- and BIP44-compatible.

## Requirements and install

First clone the repository and install the dependencies using the next commands:

```BASH
$ npm install
$ sudo npm link
```

Now you are ready for use it globally:

```BASH
$ ./walletd
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

