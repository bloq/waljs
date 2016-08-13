#!/usr/bin/env nodejs

const assert = require('assert');
const fs = require('fs');
const crypto = require('crypto');
const dns = require('dns');
const program = require('commander');
const async = require('async');
const bitcore = require('bitcore-lib');
const Mnemonic = require('bitcore-mnemonic');
const RpcClient = require('bitcoind-rpc');

program
	.version('0.0.1')
	.option('-f, --file <path>', 'Wallet file (def: keys-wal.json.aes)')
	.option('--rpcinfo <path>', 'bitcoind RPC credentials (def. rpc-info.json)')
	.option('--cache <path>', 'Wallet cache file (def: cache-wal.json)')
	.option('--cacheChain <path>', 'Blockchain cache file (def: cache-blocks.json)')
	.option('--create', 'CMD: Create new wallet')
	.option('--check', 'CMD: Validate wallet integrity')
	.option('--accountNew <name>', 'CMD: Create new account')
	.option('--accountDefault <name>', 'CMD: Set default account to <name>')
	.option('--accountList', 'CMD: List accounts and balances')
	.option('--addressNew', 'CMD: Generate new address for default account')
	.option('--addressLast', 'CMD: Show most recently generated address for default account')
	.option('--txList', 'CMD: List wallet transactions')
	.option('--seedNet', 'CMD: Seed network peer list via DNS')
	.option('--syncHeaders', 'CMD: Cache block headers for best chain')
	.option('--scanBlocks', 'CMD: Scan blocks for impactful UTXO activity')
	.option('--rescanPtr <hash>', 'CMD: Reset block scan pointer to given hash')
	.option('--spend <path>', 'CMD: Create new transaction, spending UTXOs')
	.parse(process.argv);

var network = bitcore.Networks.livenet;

var wallet = null;
var walletFn = 'keys-wal.json.aes';
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
	// Read wallet cache
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

	// Read blockchain cache
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

function walletGetSecret()
{
	if (!('WAL_SECRET' in process.env)) {
		console.error("WAL_SECRET must be set, to enable encryption");
		process.exit(1);
	}

	return process.env.WAL_SECRET;
}

function walletRead()
{
	if (program.file) walletFn = program.file;

	var ciphertext = fs.readFileSync(walletFn, 'binary');

	var plaintext = '';
	var walletSecret = walletGetSecret();
	var ciph = crypto.createDecipher('aes256', walletSecret);
	plaintext += ciph.update(ciphertext, 'binary', 'utf8');
	plaintext += ciph.final('utf8');

	wallet = JSON.parse(plaintext);
}

function walletWrite()
{
	if (!modified)
		return;

	if (fs.existsSync(walletFn))
		fs.renameSync(walletFn, walletFn + ".bak");

	var plaintext = JSON.stringify(wallet, null, 2) + "\n";

	var bufs = [];
	var walletSecret = walletGetSecret();
	var ciph = crypto.createCipher('aes256', walletSecret);
	bufs.push(ciph.update(plaintext, 'utf8'));
	bufs.push(ciph.final());
	var ciphertext = Buffer.concat(bufs);

	fs.writeFileSync(walletFn, ciphertext, 'binary');

	modified = false;
}

function walletCreate()
{
	// Generate mnemonic code
	var code = new Mnemonic();

	console.log("PRINT OUT the following wallet recovery words. You will only be shown this once:");
	console.log(code.toString());

	var hdPrivateKey = code.toHDPrivateKey();
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

	assert('version' in wallet);
	assert(wallet.version > 0);
	assert('accounts' in wallet);
	assert(Object.keys(wallet.accounts).length > 0);
	assert('defaultAccount' in wallet);
	assert(wallet.defaultAccount in wallet.accounts);
	assert('nextIndex' in wallet);

	console.log("All checks succeeded.");
}

function cmdAccountList()
{
	// Generate list of wallets
	var accts = {};
	Object.keys(wallet.accounts).forEach(function(acctName) {
		var obj = {
			name: acctName,
			satoshis: 0,
		};

		accts[acctName] = obj;
	});

	// For each UTXO, assign to an account
	for (var utxoId in cache.unspent) {
		var utxo = cache.unspent[utxoId];
		var addrInfo = cache.matchAddresses[utxo.address];
		accts[addrInfo.account].satoshis += utxo.satoshis;
		accts[addrInfo.account].btc =
			bitcore.Unit.fromSatoshis(accts[addrInfo.account].satoshis).toBTC();
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

	// Select last|next key to display|generate
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

	// If creating a new address, store new cache entry
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

	// Async resolve for each DNS seed
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

		// Store updated cache
		cacheWrite();

		var lenEnd = Object.keys(cache.peers).length;
		var lenDiff = lenEnd - lenStart;

		console.log("Peers seeded from DNS.  New peers discovered: " + lenDiff.toString());
	});
}

function downloadHeaders(rpc)
{
	var n_headers = 0;

	// Request headers, starting from most recent, moving earlier in
	// time until we reach a header hash we've seen before.
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

			// Build block header cache entry
			var obj = {
				height: res.result.height,
				time: res.result.time,
				merkleroot: res.result.merkleroot,
				previousblockhash: res.result.previousblockhash || null,
				nextblockhash: res.result.nextblockhash || null,
			};

			// Store in cache; attach to doubly-linked list
			bcache.blocks[scanHash] = obj;
			if (obj.previousblockhash in bcache.blocks)
				bcache.blocks[obj.previousblockhash].nextblockhash = scanHash;
			bcacheModified = true;

			// Advance to previous block
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

	// Ask server for chain tip (most recent block)
	const rpc = new RpcClient(rpcInfoObj);
	rpc.getBestBlockHash(function(err, res) {
		if (err) {
			console.error("Cannot get best block hash: " + err);
			return;
		}

		var newBestBlock = res.result;

		// If best-block is different (new blocks or reorg),
		// initiate header download
		if (newBestBlock != bcache.bestBlock) {
			bcache.bestBlock = res.result;
			bcacheModified = true;

			bcache.wantHeader = bcache.bestBlock;
			downloadHeaders(rpc);
		}
	});
}

function scanTx(tx, blkhash)
{
	var matchTxout = {};
	var matchTxin = {};

	// Scan outputs for addresses we know
	for (var i = 0; i < tx.outputs.length; i++) {
		var txout = tx.outputs[i];
		var addr = txout.script.toAddress();
		if (addr && (addr.toString() in cache.matchAddresses)) {

			var id = tx.hash + "," + i.toString();

			matchTxout[i] = true;

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

	// Scan inputs for UTXOs we own
	for (var i = 0; i < tx.inputs.length; i++) {
		var txin = tx.inputs[i];

		var id = txin.prevTxId.toString('hex') + "," + txin.outputIndex.toString();

		if (id in cache.unspent) {
			delete cache.unspent[id];
			matchTxin[i] = true;
		}
	}

	// Cache entire TX, if ours
	if ((Object.keys(matchTxout).length > 0) ||
	    (Object.keys(matchTxin).length > 0)) {
		console.log("New wallet TX " + tx.hash);

		cache.myTx[tx.hash] = tx.toObject();
		cache.myTx[tx.hash].raw = tx.toString();

		if (blkhash)
			cache.myTx[tx.hash].blockhash = blkhash;

		for (var idx in matchTxin)
			cache.myTx[tx.hash].inputs[idx].isMine = true;
		for (var idx in matchTxout)
			cache.myTx[tx.hash].outputs[idx].isMine = true;

		cacheModified = true;
	}
}

function scanBlock(block)
{
	// Iterate through each transaction in the block
	block.transactions.forEach(function (tx) {
		scanTx(tx, block.hash);
	});
}

function cmdScanBlocks()
{
	// If scan ptr not set, set to earliest known block
	if (!cache.lastScannedBlock)
		cache.lastScannedBlock = bcache.firstScanBlock;

	// Init bitcoind RPC
	rpcInfoRead();

	const rpc = new RpcClient(rpcInfoObj);
	var n_scanned = 0;
	var n_tx_scanned = 0;
	var curtime = Date.now();

	// Download and scan each block, from ptr to chain tip
	async.until(function tester() {
		return (cache.lastScannedBlock == bcache.bestBlock);
	}, function iteree(callback) {
		const scanHash = bcache.blocks[cache.lastScannedBlock].nextblockhash;
		if (!scanHash) {
			callback();
			return;
		}

		const blockHdr = bcache.blocks[scanHash];

		// Download block
		rpc.getBlock(scanHash, false, function(err, res) {
			if (err) {
				console.error("Cannot get block: " + err);
				return;
			}

			// Decode raw block
			var block = new bitcore.Block(new Buffer(res.result, 'hex'));

			// Scan transactions in block
			scanBlock(block);

			// Advanced pointer
			cache.lastScannedBlock = scanHash;
			cacheModified = true;

			// Show progress indicator
			if ((Date.now() - curtime) > (7*1000)) {
				console.log("Progress: height " +
				    blockHdr.height.toString() + ", " +
				    n_scanned.toString() + " blocks, " +
				    n_tx_scanned.toString() + " TXs scanned.");

				curtime = Date.now();
			}

			// Update stats
			n_tx_scanned += block.transactions.length;
			n_scanned++;
			callback();
		});
	}, function done() {
		// Flush updated cache
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

	// Build new match object for new change address
	var matchObj = {
		address: addressStr,
		createTime: now.toISOString(),
		account: acctObj.name,
		acctIndex: acctObj.index,
		keyIndex: keyIndex,
		change: true,
	};

	// Store match obj in cache
	acctObj.nextKey++;
	modified = true;

	cache.matchAddresses[addressStr] = matchObj;
	cacheModified = true;

	if ('btc' in spendInfo.to)
		spendInfo.to.satoshis = bitcore.Unit.fromBTC(spendInfo.to.btc).toSatoshis();

	// Generate and sign bitcoin transaction
	var tx = new bitcore.Transaction()
		.from(acctUtxos)
		.to(spendInfo.to.address, spendInfo.to.satoshis)
		.change(changeAddr)
		.sign(privkeys);

	// Add new tx to internal cache
	scanTx(tx, null);

	// Sync db
	walletWrite();
	cacheWrite();

	// Output transaction (hex) to console
	console.log(tx.toString());

	// Init bitcoind RPC
	rpcInfoRead();

	const rpc = new RpcClient(rpcInfoObj);

	rpc.sendRawTransaction(tx.toString(), function (err, res) {
		if (err) {
			console.error("Send TX failed, " + err);
			return;
		}

		console.log("Sent txid " + tx.hash);
	});
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

function cmdRescanPtr(hash)
{
	if (!(hash in bcache.blocks)) {
		console.error("Hash not found in cache: " + hash);
		return;
	}

	cache.lastScannedBlock = hash;
	cacheModified = true;

	console.log("Block scan reset to " + hash);
}

//
// Main program operation starts here
//

// Initialize configuration, read caches and key dbs
if (program.create) {
	walletCreate();
} else
	walletRead();
cacheRead();

// Execute specified command
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
else if (program.rescanPtr)
	cmdRescanPtr(program.rescanPtr);

// Flush caches and wallet db, if not already done so inline
walletWrite();
cacheWrite();

