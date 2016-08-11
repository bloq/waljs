#!/usr/bin/env nodejs

const fs = require('fs');
const dns = require('dns');
const program = require('commander');
const async = require('async');
const bitcore = require('bitcore-lib');
const RpcClient = require('bitcoind-rpc');

program
	.version('0.0.1')
	.option('-f, --file <path>', 'Wallet file')
	.option('--rpcinfo <path>', 'bitcoind RPC credentials & configuration')
	.option('--cache <path>', 'Wallet cache file')
	.option('--cacheChain <path>', 'Blockchain cache file')
	.option('--create', 'Create new wallet')
	.option('--check', 'Validate wallet integrity')
	.option('--accountNew <name>', 'Create new account')
	.option('--accountDefault <name>', 'Set default account to <name>')
	.option('--accountList', 'List accounts')
	.option('--addressNew', 'Generate new address for default account')
	.option('--addressLast', 'Show most recently generated address for default account')
	.option('--txList', 'List wallet transactions')
	.option('--seedNet', 'Seed network peer list via DNS')
	.option('--syncHeaders', 'Cache block headers for best chain')
	.option('--scanBlocks', 'Scan blocks for impactful UTXO activity')
	.option('--spend <path>', 'Create new transaction, spending UTXOs')
	.parse(process.argv);

var network = bitcore.Networks.livenet;

var wallet = null;
var walletFn = 'keys-wal.json';
var modified = false;

var cache = null;
var cacheFn = 'cache-wal.json';
var cacheModified = false;

var bcache = null;
var bcacheFn = 'cache-blocks.json';
var bcacheModified = false;

var rpcInfoFn = program.rpcinfo || 'rpc-info.json';
var rpcInfoObj = null;

function rpcInfoRead()
{
	rpcInfoObj = JSON.parse(fs.readFileSync(rpcInfoFn, 'utf8'));
}

function cacheRead()
{
	if (program.cache) cacheFn = program.cache;
	if (fs.existsSync(cacheFn))
		cache = JSON.parse(fs.readFileSync(cacheFn, 'utf8'));
	else {
		cache = {
			peers: {},

			lastScannedBlock: null,
			matchAddresses: {},
			unspent: {},
			myTx: {},
		};
		cacheModified = true;
	}

	if (program.cacheChain) bcacheFn = program.cacheChain;
	if (fs.existsSync(bcacheFn))
		bcache = JSON.parse(fs.readFileSync(bcacheFn, 'utf8'));
	else {
		bcache = {
			blocks: {
			 "000000000000000001910d9f594aea0950d580d08c07ec324d0573bd3272ae86": {
				"height": 423000,
				"time": 1469961500,
				"merkleroot": "9ea055f22d0906eb8492985b7b5350de95b4942278d00d234108e39ad8c509b3",
				"previousblockhash":"000000000000000003797cd09efa8c88e0d5c4c26712250c9f977aa6a2371d33",
			 }
			},
			firstScanBlock: "000000000000000001910d9f594aea0950d580d08c07ec324d0573bd3272ae86",
			bestBlock: null,
			wantHeader: null,
		};
		bcacheModified = true;
	}
}

function cacheWrite()
{
	if (cacheModified)
		fs.writeFileSync(cacheFn, JSON.stringify(cache, null, 2) + "\n");
	if (bcacheModified)
		fs.writeFileSync(bcacheFn, JSON.stringify(bcache, null, 2) + "\n");

	cacheModified = false;
	bcacheModified = false;
}

function cacheNetPeer(addr)
{
	if (addr in cache.peers)
		return;

	var now = new Date();

	var peerObj = {
		address: addr,
		createTime: now.toISOString(),
	};

	cache.peers[addr] = peerObj;
	cacheModified = true;
}

function walletRead()
{
	if (program.file) walletFn = program.file;
	wallet = JSON.parse(fs.readFileSync(walletFn, 'utf8'));
}

function walletWrite()
{
	if (!modified)
		return;

	if (fs.existsSync(walletFn))
		fs.renameSync(walletFn, walletFn + ".bak");

	fs.writeFileSync(walletFn, JSON.stringify(wallet, null, 2) + "\n");

	modified = false;
}

function walletCreate()
{
	var hdPrivateKey = new bitcore.HDPrivateKey();
	wallet = {
		version: 1000000,
		privkeys: [
			{ typ: "xpriv", 
			  data: hdPrivateKey.toString(), }
		],
		accounts: {},
		defaultAccount: "master",
		nextIndex: 0,
	};

	cmdAccountNew("master");

	modified = true;
}

function cmdCheck()
{
	var n_checked = 0;

	wallet.privkeys.forEach(function(privkey) {
		if (privkey.typ == "xpriv") {
			var hdpk = new bitcore.HDPrivateKey(privkey.data)
		} else {
			console.error("Invalid key type");
			return;
		}

		n_checked++;
	});

	console.log("Keys checked: " + n_checked.toString());
}

function cmdAccountList()
{
	var accts = {};
	Object.keys(wallet.accounts).forEach(function(acctName) {
		var obj = {
			name: acctName,
			satoshis: 0,
		};

		accts[acctName] = obj;
	});

	for (var utxoId in cache.unspent) {
		var utxo = cache.unspent[utxoId];
		var addrInfo = cache.matchAddresses[utxo.address];
		accts[addrInfo.account].satoshis += utxo.satoshis;
	}

	console.log(JSON.stringify(accts, null, 2) + "\n");
}

function cmdAccountNew(acctName)
{
	if (acctName in wallet.accounts) {
		console.error("Duplicate account name");
		return;
	}

	var now = new Date();

	var obj = {
		name: acctName,
		index: wallet.nextIndex,
		nextKey: 0,
		createTime: now.toISOString(),
	};

	wallet.accounts[acctName] = obj;
	wallet.nextIndex++;

	modified = true;
}

function cmdAccountDefault(acctName)
{
	if (acctName in wallet.accounts) {
		wallet.defaultAccount = acctName;
		modified = true;
	} else {
		console.error("unknown account");
		return;
	}
}

function cmdAccountAddress(newAddr)
{
	var privkeyObj = wallet.privkeys[0];
	var acctObj = wallet.accounts[wallet.defaultAccount];

	var keyIndex;
	if (newAddr)
		keyIndex = acctObj.nextKey;
	else {
		if (acctObj.nextKey == 0) {
			console.error("no key yet generated");
			return;
		}

		keyIndex = acctObj.nextKey - 1;
	}

	// Verify this is BIP 44 etc. compatible
	var hdpath_hard = "m/44'/0'/" +
		     acctObj.index.toString() + "'";
	var hdpath_pub = "m/0/" +
		     keyIndex.toString();

	// Get pubkey for hardened path
	var hdpriv = new bitcore.HDPrivateKey(privkeyObj.data);
	var derivedKey = hdpriv.derive(hdpath_hard);
	var hdpub = derivedKey.hdPublicKey;

	// Derive address for public path
	var address = new bitcore.Address(hdpub.derive(hdpath_pub).publicKey,
					  network);

	// Output [generated] address
	var addressStr = address.toString();
	console.log(addressStr);

	if (newAddr) {
		var now = new Date();

		var matchObj = {
			address: addressStr,
			createTime: now.toISOString(),
			account: acctObj.name,
			acctIndex: acctObj.index,
			keyIndex: keyIndex,
			change: false,
		};

		acctObj.nextKey++;
		modified = true;

		cache.matchAddresses[addressStr] = matchObj;
		cacheModified = true;
	}
}

function cmdNetSeed()
{
	var seeds = network.dnsSeeds;

	var lenStart = Object.keys(cache.peers).length;

	async.each(seeds, function iteree(hostname, cb) {
		dns.resolve4(hostname, function (err, addresses) {
			if (err) {
				cb(err);
				return;
			}

			addresses.forEach(function(addr) {
				cacheNetPeer(addr);
			});

			cb();
		});
	}, function done() {
		cacheWrite();

		var lenEnd = Object.keys(cache.peers).length;
		var lenDiff = lenEnd - lenStart;

		console.log("Peers seeded from DNS.  New peers discovered: " + lenDiff.toString());
	});
}

function downloadHeaders(rpc)
{
	var n_headers = 0;

	async.until(function tester() {
		return (bcache.wantHeader && (bcache.wantHeader in bcache.blocks));
	}, function iteree(callback) {
		var scanHash = bcache.wantHeader;
		rpc.getBlockHeader(scanHash, function(err, res) {
			if (err) {
				console.error("Block header failed, " + err);
				callback(err);
				return;
			}

			var obj = {
				height: res.result.height,
				time: res.result.time,
				merkleroot: res.result.merkleroot,
				previousblockhash: res.result.previousblockhash || null,
				nextblockhash: res.result.nextblockhash || null,
			};

			bcache.blocks[scanHash] = obj;
			if (obj.previousblockhash in bcache.blocks)
				bcache.blocks[obj.previousblockhash].nextblockhash = scanHash;
			bcacheModified = true;

			if (obj.previousblockhash && obj.height > 0)
				bcache.wantHeader = obj.previousblockhash;

			n_headers++;
			callback();
		});
	}, function done() {
		cacheWrite();
		console.log(n_headers.toString() + " headers downloaded.");
		console.log("Tip " + bcache.bestBlock);
	});
}

function cmdSyncHeaders()
{
	rpcInfoRead();

	const rpc = new RpcClient(rpcInfoObj);
	rpc.getBestBlockHash(function(err, res) {
		if (err) {
			console.error("Cannot get best block hash: " + err);
			return;
		}

		var newBestBlock = res.result;

		if (newBestBlock != bcache.bestBlock) {
			bcache.bestBlock = res.result;
			bcacheModified = true;

			bcache.wantHeader = bcache.bestBlock;
			downloadHeaders(rpc);
		}
	});
}

function scanBlock(block)
{
	block.transactions.forEach(function(tx) {
		var matchTxout = [];
		var matchTxin = [];

		for (var i = 0; i < tx.outputs.length; i++) {
			var txout = tx.outputs[i];
			var addr = txout.script.toAddress();
			if (addr && (addr.toString() in cache.matchAddresses)) {

				var id = tx.hash + "," + i.toString();

				matchTxout.push(id);

				var unspentObj = {
					txid: tx.hash,
					vout: i,
					address: addr.toString(),
					script: txout.script.toHex(),
					satoshis: txout.satoshis,
				};
				cache.unspent[id] = unspentObj;
			}
		}

		for (var i = 0; i < tx.inputs.length; i++) {
			var txin = tx.inputs[i];

			var id = txin.prevTxId.toString('hex') + "," + txin.outputIndex.toString();

			if (id in cache.unspent) {
				delete cache.unspent[id];
				matchTxin.push(id);
			}
		}

		if ((matchTxout.length > 0) || (matchTxin > 0)) {
			console.log("New wallet TX " + tx.hash);
			cache.myTx[tx.hash] = tx.toObject();
			cacheModified = true;
		}
	});
}

function cmdScanBlocks()
{
	if (!cache.lastScannedBlock)
		cache.lastScannedBlock = bcache.firstScanBlock;

	rpcInfoRead();

	const rpc = new RpcClient(rpcInfoObj);
	var n_scanned = 0;
	var n_tx_scanned = 0;
	var curtime = Date.now();

	async.until(function tester() {
		return (cache.lastScannedBlock == bcache.bestBlock);
	}, function iteree(callback) {
		const scanHash = bcache.blocks[cache.lastScannedBlock].nextblockhash;
		if (!scanHash) {
			callback();
			return;
		}

		const blockHdr = bcache.blocks[scanHash];

		rpc.getBlock(scanHash, false, function(err, res) {
			if (err) {
				console.error("Cannot get block: " + err);
				return;
			}

			var block = new bitcore.Block(new Buffer(res.result, 'hex'));

			scanBlock(block);

			cache.lastScannedBlock = scanHash;
			cacheModified = true;

			if ((Date.now() - curtime) > (7*1000)) {
				console.log("Progress: " + n_scanned.toString() + " blocks, " +
				    n_tx_scanned.toString() + " TXs scanned.");

				curtime = Date.now();
			}

			n_tx_scanned += block.transactions.length;
			n_scanned++;
			callback();
		});
	}, function done() {
		cacheWrite();
		console.log(n_scanned.toString() + " blocks, " +
			    n_tx_scanned.toString() + " TXs scanned.");
	});
}

function privkeyFromAddress(addr)
{
	var matchObj = cache.matchAddresses[addr];

	// Verify this is BIP 44 etc. compatible
	var hdpath_hard = "m/44'/0'/" +
		     matchObj.acctIndex.toString() + "'";
	var hdpath_pub = "m/";
	if (matchObj.change)
		hdpath_pub += "1/";
	else	hdpath_pub += "0/";
	hdpath_pub += matchObj.keyIndex.toString();

	// Get pubkey for hardened path
	var privkeyObj = wallet.privkeys[0];
	var hdpriv = new bitcore.HDPrivateKey(privkeyObj.data);
	var derivedKey1 = hdpriv.derive(hdpath_hard);
	var derivedKey2 = derivedKey1.derive(hdpath_pub);

	return derivedKey2.privateKey;
}

function cmdSpend(spendFn)
{
	spendInfo = JSON.parse(fs.readFileSync(spendFn, 'utf8'));
	var account = spendInfo.account;
	var acctObj = wallet.accounts[account];

	// List UTXOs for this account
	var acctUtxos = [];
	var privkeys = [];
	for (var utxoId in cache.unspent) {
		var utxo = cache.unspent[utxoId];
		var addrInfo = cache.matchAddresses[utxo.address];
		if (addrInfo.account == account) {
			var utxoObj = new bitcore.Transaction.UnspentOutput(utxo);
			acctUtxos.push(utxoObj);
			privkeys.push(privkeyFromAddress(utxoObj.address));
		}
	}

	//
	// Generate change address
	//

	// Verify this is BIP 44 etc. compatible
	var keyIndex = acctObj.nextKey;
	var hdpath_hard = "m/44'/0'/" +
		     acctObj.index.toString() + "'";
	var hdpath_pub = "m/1/" +
		     keyIndex.toString();

	// Get pubkey for hardened path
	var privkeyObj = wallet.privkeys[0];
	var hdpriv = new bitcore.HDPrivateKey(privkeyObj.data);
	var derivedKey = hdpriv.derive(hdpath_hard);
	var hdpub = derivedKey.hdPublicKey;

	// Derive address for public path
	var changeAddr = new bitcore.Address(hdpub.derive(hdpath_pub).publicKey,
					  network);

	var addressStr = changeAddr.toString();
	var now = new Date();

	var matchObj = {
		address: addressStr,
		createTime: now.toISOString(),
		account: acctObj.name,
		acctIndex: acctObj.index,
		keyIndex: keyIndex,
		change: true,
	};

	acctObj.nextKey++;
	modified = true;

	cache.matchAddresses[addressStr] = matchObj;
	cacheModified = true;

	var tx = new bitcore.Transaction()
		.from(acctUtxos)
		.to(spendInfo.to.address, spendInfo.to.satoshis)
		.change(changeAddr)
		.sign(privkeys);
	console.log(tx.toString());
}

function cmdTxList()
{
	var txlist = [];

	for (var txid in cache.myTx) {
		var obj = {
			txid: txid,
		};

		txlist.push(obj);
	}

	console.log(JSON.stringify(txlist, null, 2) + "\n");
}

if (program.create) {
	walletCreate();
} else
	walletRead();
cacheRead();

if (program.check)
	cmdCheck();
else if (program.accountNew)
	cmdAccountNew(program.accountNew);
else if (program.accountDefault)
	cmdAccountDefault(program.accountDefault);
else if (program.accountList)
	cmdAccountList();
else if (program.addressNew)
	cmdAccountAddress(true);
else if (program.addressLast)
	cmdAccountAddress(false);
else if (program.seedNet)
	cmdNetSeed();
else if (program.syncHeaders)
	cmdSyncHeaders();
else if (program.scanBlocks)
	cmdScanBlocks();
else if (program.spend)
	cmdSpend(program.spend);
else if (program.txList)
	cmdTxList();

walletWrite();
cacheWrite();

