#!/usr/bin/env nodejs

const fs = require('fs');
const program = require('commander');
const bitcore = require('bitcore-lib');

program
	.version('0.0.1')
	.option('-f, --file <path>', 'Wallet file')
	.option('--create', 'Create new wallet')
	.option('--check', 'Validate wallet integrity')
	.option('--accountNew <name>', 'Create new account')
	.option('--accountDefault <name>', 'Set default account to <name>')
	.parse(process.argv);

var wallet = null;
var walletFn = 'stor-wallet-keys.json';
var modified = false;

function walletRead()
{
	if (program.file) walletFn = program.file;
	wallet = JSON.parse(fs.readFileSync(walletFn, 'utf8'));
}

function walletWrite()
{
	if (fs.existsSync(walletFn))
		fs.renameSync(walletFn, walletFn + ".bak");

	fs.writeFileSync(walletFn, JSON.stringify(wallet, null, 2) + "\n");
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
		accounts: {
			master: { name: "master", index: 0 }
		},
		defaultAccount: "master",
		nextIndex: 1,
	};
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

function cmdAccountNew(acctName)
{
	if (acctName in wallet.accounts) {
		console.error("Duplicate account name");
		return;
	}

	var obj = {
		name: acctName,
		index: wallet.nextIndex,
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

if (program.create) {
	walletCreate();
	modified = true;
} else
	walletRead();

if (program.check)
	cmdCheck();
else if (program.accountNew)
	cmdAccountNew(program.accountNew);
else if (program.accountDefault)
	cmdAccountDefault(program.accountDefault);

if (modified)
	walletWrite();

