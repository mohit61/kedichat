const electron = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const openpgp = require('openpgp');
const ping = require('kedi-ping');
const net = require('net');
const work = require('work-token/sync');
const sha256 = require('sha256');
const unescapeJs = require('unescape-js');
const md5 = require('md5');
const Message = require('@isomorphic-pgp/parser/Message');
const sha256File = require('sha256-file');

let privkey, pubkey, revocationCertificate;


let current_name = null;
let current_public = null;
let current_secret = null;
let current_email = null;
let current_pass = null;
let current_revocationCertificate = null;


let node_addres = 'http://localhost:3600';
//let node_addres = 'http://ec2-18-217-185-98.us-east-2.compute.amazonaws.com:3200';

const io = require('socket.io-client');
const socket = io.connect(node_addres);

socket.on('connect', () => {
    console.log('Connected');
});

socket.on('receiveMessage', (data) => {
    //TODO get messages
    //saveGeneralHistory(senderPubKey, message, timestamp)
    saveGeneralHistory(data.senderPubKey, data.message, data.timestamp);
    if(decryptData(data.message)){
        console.log('Received and decrypted');
        console.log(data.senderPubKey);

        //saveMyHistory(senderPubKey, message, timestamp, isMe)
        saveMyHistory(data.senderPubKey, data.message, data.timestamp, false);

        let contacts_search = fs.readdirSync(path.join(__dirname, 'contacts'));
        let sender = null;
        let ss,dd;
        for(let i = 0; i < contacts_search.length; i++){
            console.log("Search Contact " + contacts_search[i]);
            let contacts_search_value = fs.readFileSync(path.join(__dirname, 'contacts/' + contacts_search[i]));
            contacts_search_value = JSON.parse(contacts_search_value);
            console.log(contacts_search_value.publicKey);
            ss = md5(Message.parse(data.senderPubKey));
            dd = md5(Message.parse(contacts_search_value.publicKey));
            if(ss == dd){
                sender = contacts_search_value.name;
                break;
            }

        }

        if(sender == null){
            let count = fs.readFileSync(path.join(__dirname, 'anoncount.conf'));
            count = parseInt(count) + 1;
            sender = 'Anonim' + count;
            is_recorded = false;
            fs.writeFileSync(path.join(__dirname, 'anoncount.conf'), '');
            fs.writeFileSync(path.join(__dirname, 'anoncount.conf'), count);
            fs.writeFileSync(path.join(__dirname, 'contacts/' + sender + '.json'), JSON.stringify({
                "name": sender,
                "publicKey": data.senderPubKey,
                "protocol": 'anonim'
            }));
            contactListInit();
        }
        
        mainWindow.webContents.send('new_message', JSON.stringify({
            message: decryptData(data.message),
            timestamp: data.timestamp,
            sender: sender
        }));
        
    


    }
});




const {app, BrowserWindow, Menu, ipcMain, dialog} = electron;

let mainWindow;
let addWindow = null; 
let addAccountWindow = null;
let addContactWindow = null;
let renameWindow = null;

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        webPreferences: {nodeIntegration: true}
    });

    socket.emit('syncHistory', 'askGeneralHistory');

    socket.on('syncHistory', () => {
        let general_history = readGeneralHistory();
        socket.emit('syncHistory', sha256(general_history));
    });

    socket.on('sendUsHistory', (data) => {
        let general_history = readGeneralHistory();

        if(sha256(general_history) == data){
            socket.emit('sendingHistory', {text: general_history, sign: sha256(general_history)});
        }

    });

    socket.on('updatedHistory', (data) => {
        let general_history = readGeneralHistory();
        if(data.sign != sha256(general_history)){
            let writeGeneralHistory = fs.createWriteStream(path.join(__dirname , 'general_history.data'));
            console.log("Data Text: " + data.text);

            text = data.text;

            writeGeneralHistory.write(text);
            console.log("Updated History Written");
        }

        let general_history_parsed = data.text.split(";");
        let last_timestamp = fs.readFileSync(path.join(__dirname, 'last_logout.data'));

        // senderPubKey, message, timestamp
        if(last_timestamp != ""){
            for(let i = 0; i < general_history_parsed.length; i++){
                if(general_history_parsed[i] != "" || general_history_parsed[i] != " "){
                    let output = JSON.parse(general_history_parsed[i]);
                    console.log("We Got There");
                    if(output.timestamp > last_timestamp){
                        console.log("Timestamp passed.");
                        let decryptedText = decryptData(output.message);
                        //saveMyHistory(senderPubKey, message, timestamp, isMe)
                        if(decryptedText){
                            console.log("Decrypting passed.");
                            saveMyHistory(output.senderPubKey, output.message, output.timestamp, false);
                        }
                    }
                }
            }
        }
        

    });



    /*dialog.showOpenDialog({ properties: ['openFile'] }, function(file){
        console.log(file);
    });*/

    mainWindow.maximize();

    
    

    mainWindow.webContents.once('dom-ready', () => {
        let pathname = path.join(__dirname, 'accounts');

        socket.emit('syncHistory','');


        try {
            if (!fs.existsSync(pathname)) {
                fs.mkdirSync('accounts');
                fs.writeFileSync(path.join(__dirname, 'accounts/select.conf'), '');
            } else {
                let selected = fs.readFileSync(path.join(__dirname, 'accounts/select.conf'));
                if(selected != ""){
                let values = fs.readFileSync(path.join(__dirname, 'accounts/' + selected));
                mainWindow.webContents.send('select', values);
                values = JSON.parse(values);

                //current_name, current_public, current_secret, current_email, current_pass
                //name, email, pass, secretKey, publicKey

                current_name = values.name;
                current_public = values.publicKey;
                current_secret = values.secretKey;
                current_email = values.email
                current_pass = values.pass;
                current_revocationCertificate = values.revocationCertificate;

                }
                

            }
        }catch(err) {
            throw err;
        }

        try{
            if (!fs.existsSync(path.join(__dirname, 'contacts'))) {
                fs.mkdirSync('contacts');
            } else {
               /* let selected = fs.readFileSync(path.join(__dirname, 'accounts/select.conf'));
                let values = fs.readFileSync(path.join(__dirname, 'accounts/' + selected));
                mainWindow.webContents.send('select', values);
                values = JSON.parse(values);*/

                contactListInit();

            }
        }catch(err){
            throw err;
        }


    });

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'pages/main.html'),
        protocol: 'file',
        slashes: true
    }));

    ipcMain.on('Contact:Delete', (err, data) => {
        fs.unlinkSync(path.join(__dirname, 'contacts/' + data + '.json'));
        contactListInit();
    });

    ipcMain.on('importFile', () => {
        dialog.showOpenDialog({ properties: ['openFile'] }, function(file){
            if(file != undefined){
                let file_data = fs.readFileSync(file[0]);

                addContactWindow.webContents.send('ImportFileCb', file_data);
            }
        });
    });

    
    ipcMain.on('Close', (err, data) => {
        if(data == 'account'){
            addWindow.close();
            addWindow = null;
            console.log("Create Account");
        }else if(data == 'add'){
            console.log('addWindow');
            addAccountWindow.close();
            addAccountWindow = null;
        }else if(data == 'contact'){
            addContactWindow.close();
            addContactWindow = null;
        }else if(data == 'rename'){
            renameWindow.close();
            renameWindow = null;
        }
        
    });

    ipcMain.on('Account:Remove', (err, data) => {
        fs.unlinkSync(path.join(__dirname, '/accounts/' + data));
    });

    ipcMain.on('Account:Add', () => {
        addAccountWindow = new BrowserWindow({
            webPreferences: {nodeIntegration: true},
            height: 400,
            width: 500
        });

        addAccountWindow.setResizable(false);

        addAccountWindow.loadURL(url.format({
            pathname: __dirname + "/pages/addAccount.html",
            protocol: 'file',
            slashes: true
        }));

        

        addAccountWindow.on('close', () => {
            addAccountWindow  = null
        });
    });

    ipcMain.on('Contact:Rename2', (err, data) => {
        data = JSON.parse(data);

        fs.renameSync(path.join(__dirname, 'contacts/' + data.old_name + '.json'), path.join(__dirname, 'contacts/' + data.new_name + '.json'));
        contactListInit();
        renameWindow.close();
        renameWindow = null;
    });

    ipcMain.on('Contact:Rename', (err, data) => {
        renameWindow = new BrowserWindow({
            webPreferences: {nodeIntegration: true},
            height: 400,
            width: 500
        });

        renameWindow.setResizable(false);

        renameWindow.loadURL(url.format({
            pathname: path.join(__dirname, 'pages/renameContact.html'),
            protocol: 'file',
            slashes: true
        }));

        renameWindow.webContents.once('dom-ready', () => {
            renameWindow.webContents.send('init', data);
        });


        renameWindow.on('close', () => {
            renameWindow = null;
        });
        

    });

    ipcMain.on('addContact', (err, data) => {
        addContactWindow = new BrowserWindow({
            webPreferences: {nodeIntegration: true},
            height: 500,
            width: 500
        });

        addContactWindow.setResizable(false);

        addContactWindow.loadURL(url.format({
            pathname: path.join(__dirname, '/pages/addContact.html'),
            protocol: 'file',
            slashes: true
        }));

        addContactWindow.on('close', () => {
            addContactWindow = null;
        });

    });


    ipcMain.on('Account:Select', (err, data) => {
        let value = fs.readFileSync(path.join(__dirname, 'accounts/' + data));
        mainWindow.webContents.send('select', value);
        value = JSON.parse(value);

        //current_name, current_public, current_secret, current_email, current_pass
        //name, email, pass, secretKey, publicKey

        current_name = value.name;
        current_public = value.publicKey;
        current_secret = value.secretKey;
        current_email = value.email
        current_pass = value.pass;
        current_revocationCertificate = value.revocationCertificate;

        fs.writeFileSync(path.join(__dirname, 'accounts/select.conf'), current_name + '.json');

        addWindow.close();
        addWindow = null;
    });

    ipcMain.on('Contact:Add', (err, data) => {
        data = JSON.parse(data);
        fs.writeFileSync(path.join(__dirname, 'contacts/' + data.name + '.json'), JSON.stringify(data));
        addContactWindow.close();
        addContactWindow = null;
        contactListInit();
    });

    ipcMain.on('getContactPublicKey', (err, data) => {
        data = fs.readFileSync(path.join(__dirname, 'contacts/' + data + '.json'));
        data = JSON.parse(data);
        mainWindow.webContents.send('sendContactPublicKey', data.publicKey);
    });

    ipcMain.on('getHistory', (err, data) => {
        data = JSON.parse(data);

        // data = contact_name and contact_public    publicKey contact_name

        let output14 = '';
        let source14 = fs.createReadStream(path.join(__dirname, 'my_history.data'));
        let history = [];
        let ss,dd;
        
        source14.on('data', function(chunk) {
            output14 += chunk.toString('utf8');
        });
        source14.on('end', function() {

            if(output14 != ''){
            output14 = output14.split(';');
            console.log("Output14 length: " + output14.length);
            dd = md5(Message.parse(data.publicKey));
            for(let i = 0; i < output14.length; i++){
                if(output14[i] != '' || output14[i] != ' '){
                let value = JSON.parse(output14[i]);

                ss = md5(Message.parse(value.senderPubKey));
                let decryptedText = decryptData(value.message)

                if(ss == dd){
                    if(decryptedText){
                        history.push(JSON.stringify({
                            message: decryptedText,
                            timestamp: value.timestamp,
                            isMe: value.isMe
                        }));
                    }
                }

            }


            
        }
        
        if(history.length != 0){
            console.log("Historyss");
            console.log(history);
            mainWindow.webContents.send('takeHistory', history);
        }
    }
        });

    });


    ipcMain.on('sendMessage', (err, data) => {
        console.log("DATA: " + data.message);
        //publicKey: contact_public_key message: message_value
        let send_value = {
            senderPubKey: current_public,
            signature: signData('asd'),
            message: encryptData(data.publicKey, data.message),
            timestamp: Date.now()
        };
        let register_value = {
            senderPubKey: send_value.senderPubKey,
            message: send_value.message,
            timestamp: send_value.timestamp
        }
        //saveMyHistory(senderPubKey, message, timestamp, isMe)
        saveMyHistory(data.publicKey, encryptData(current_public, data.message), send_value.timestamp, true);
        /*
            senderPubKey: data.senderPubKey,
            message: data.message,
            timestamp: data.timestamp
        */
        //saveGeneralHistory(senderPubKey, message, timestamp)
        saveGeneralHistory(send_value.senderPubKey, send_value.message, send_value.timestamp);

        socket.emit('sendMessage', send_value);



    });

    ipcMain.on('getMessages', (err, data) => {

    });

    ipcMain.on('Account:Create', (err, data) => {
        data = JSON.parse(data);
        

       //createKeyPair(name, email, pass)
       //privkey, pubkey, revocationCertificate

       let name = data.name;
       let email = data.email;
       let pass = data.pass;
      
       createKeyPair(name, email, pass);

       current_name = name;
       current_email = email;
       current_pass = pass;
       current_secret = privkey;
       current_public = pubkey;
       current_revocationCertificate = revocationCertificate;

       

       fs.writeFileSync(path.join(__dirname, 'accounts/select.conf'), current_name + '.json');

       let person = new Object();
       person.name = name;
       person.email = email;
       person.pass = pass;
       person.secretKey = privkey;
       person.publicKey = pubkey;
       person.revocationCertificate = revocationCertificate;

       let jsonArray = JSON.stringify(person);
        
        pathnameJson = __dirname + "/accounts/" + data.name + ".json";

        try{
            fs.writeFileSync(pathnameJson, jsonArray);
        }catch (e){
            console.log("Cannot write file ", e);
        }

        mainWindow.webContents.send('select', jsonArray);

        addAccountWindow.close();
        addAccountWindow = null;

        addWindow.webContents.send('init', fs.readdirSync(path.join(__dirname, '/accounts')));
    });

    const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);

    Menu.setApplicationMenu(mainMenu);

    mainWindow.on('close', () => {
        fs.writeFileSync(path.join(__dirname, 'last_logout.data'), Date.now());
        console.log("Last Logout Written.");
        if(addWindow != null){
            console.log("Add Window Closed.");
            addWindow.close();
            addWindow = null;
        }

        if(addAccountWindow != null){
            addAccountWindow.close();
            addAccountWindow = null;
        }

        if(renameWindow != null){
            renameWindow.close();
            renameWindow = null;
        }

        if(addContactWindow != null){
            addContactWindow.close();
            addContactWindow = null;
        }


    });
});


const mainMenuTemplate = [
    {
        label: 'Dev Tools',
        click(item, focusedWindow){
            focusedWindow.toggleDevTools()
        }
    },
    {
        label: 'Refresh',
        click(item, focusedWindow){
            focusedWindow.reload();
        }
    },
    {
        label: 'Select && Add Account',
        click(){
            createAddWindow();
        }
    },
    {
        label: 'Exit',
        role: 'quit'
    }
];


function createKeyPair(name, email, pass){
    let sync = true;

    let options = {
        userIds: [{ name:name, email:email }], // multiple user IDs
        numBits: 1024,                                         // ECC curve name
        passphrase: pass         // protects the private key
    };
    
    openpgp.generateKey(options).then(function(key) {
        privkey = key.privateKeyArmored; // '-----BEGIN PGP PRIVATE KEY BLOCK ... '
        pubkey = key.publicKeyArmored;   // '-----BEGIN PGP PUBLIC KEY BLOCK ... '
        revocationCertificate = key.revocationCertificate; // '-----BEGIN PGP PUBLIC KEY BLOCK ... '
        sync = false;
    }).catch(() => {
        console.log('err');
    });
    
    

    while(sync){
        require('deasync').sleep(100);
    }
    console.log('Generated Public Key' + pubkey);
}

function createAddWindow(){
    addWindow = new BrowserWindow({
        webPreferences: {nodeIntegration: true}
    });

    addWindow.setResizable(false);

    addWindow.loadURL(url.format({
        pathname: __dirname + "/pages/account.html",
        protocol: 'file',
        slashes: true
    }));

    addWindow.webContents.once('dom-ready', () => {
        const folderPath = path.join(__dirname, '/accounts');
        addWindow.webContents.send('init', fs.readdirSync(folderPath));
    });

    addWindow.on('close', () => {
        addWindow = null
    });
}

function contactListInit(){
    let contact_list = fs.readdirSync(path.join(__dirname, 'contacts'));

    let temp = [];

    for(let i = 0; i < contact_list.length; i++){
        let s = contact_list[i].length - 5
        temp.push(contact_list[i].substr(0, s));
    }

    mainWindow.webContents.send('Contact:List', temp);
}

function encryptData(pubKey, plainText){
        let result;
        let sync = true;
        const encryptDecryptFunction = async() => {
            console.log('working');
            const options = {
                message: openpgp.message.fromText(plainText),       // input as Message object
                publicKeys: (await openpgp.key.readArmored(pubKey)).keys, // for encryption                          // for signing (optional)
            }
        
            openpgp.encrypt(options).then(ciphertext => {
                result = ciphertext.data // '-----BEGIN PGP MESSAGE ... END PGP MESSAGE-----'   
                sync = false;
            }).catch((err) => {
                console.log(err);
            })
        }
        
        encryptDecryptFunction();

        while(sync){ require('deasync').sleep(100);}
        return result;
}


function decryptData(encrypted){
    sync = true;
    let result;
    const decryptSomething = async() => {
        var privKeyObj = (await openpgp.key.readArmored(current_secret)).keys[0];
        await privKeyObj.decrypt(current_pass);
        options = {
            message: await openpgp.message.readArmored(encrypted),    // parse armored message
            privateKeys: [privKeyObj]  
        }
        openpgp.decrypt(options).then(plaintext => {
            result = plaintext.data;
            sync = false;
        }).catch(err => {
            //console.error(err);
            result = false;
            sync = false;
        })
    }
    decryptSomething();

    while(sync){require('deasync').sleep(100)}

    return result;
    
}

function signData(param){
    let sync = true;
    let result;
    const signSomething = async() => {
        var privKeyObj = (await openpgp.key.readArmored(current_secret)).keys[0];
        await privKeyObj.decrypt(current_pass);
        options = {
            message: openpgp.message.fromText(param), // CleartextMessage or Message object
            privateKeys: [privKeyObj],                   // for signing
        };
     
        openpgp.sign(options).then(signed => {
            result = signed.data;
            sync = false;
        })
    }
    signSomething();

    while(sync){ require('deasync').sleep(100);}
    return result;
}

function saveMyHistory(senderPubKey, message, timestamp, isMe){
        /*
        senderPubKey: data.senderPubKey,
            message: data.message,
            timestamp: data.timestamp
        */

        console.log("Saved to the history.");

        let readMyHistory = fs.createReadStream(path.join(__dirname, 'my_history.data'));
        let myHistoryOutput = '';
        readMyHistory.on('data', (chunk) => {
            myHistoryOutput += chunk.toString('utf8');
        });

        readMyHistory.on('end', () => {
            if(myHistoryOutput == ''){
                let myHistoryWrite = fs.createWriteStream(path.join(__dirname, 'my_history.data'));
                myHistoryWrite.write(JSON.stringify({
                    senderPubKey: senderPubKey,
                    message: message,
                    timestamp: timestamp,
                    isMe: isMe
                }));
            }else {
                let myHistoryWrite = fs.createWriteStream(path.join(__dirname , 'my_history.data'));
                myHistoryWrite.write(myHistoryOutput + ";" + JSON.stringify({
                    senderPubKey: senderPubKey,
                    message: message,
                    timestamp: timestamp,
                    isMe: isMe
                }));
            }
        });

}

function saveGeneralHistory(senderPubKey, message, timestamp){
    let readGeneralHistory = fs.createReadStream(path.join(__dirname, 'general_history.data'));
        let generalHistoryOutput = '';
        readGeneralHistory.on('data', (chunk) => {
            generalHistoryOutput += chunk.toString('utf8');
        });

        readGeneralHistory.on('end', () => {
            if(generalHistoryOutput == ''){
                let generalHistoryWrite = fs.createWriteStream(path.join(__dirname, 'general_history.data'));
                generalHistoryWrite.write(JSON.stringify({
                    senderPubKey: senderPubKey,
                    message: message,
                    timestamp: timestamp
                }));
            }else {
                let generalHistoryWrite = fs.createWriteStream(path.join(__dirname , 'general_history.data'));
                generalHistoryWrite.write(generalHistoryOutput + ";" + JSON.stringify({
                    senderPubKey: senderPubKey,
                    message: message,
                    timestamp: timestamp
                }));
            }
        });
}


function readGeneralHistory(){
    let sync = true;
    let readGeneralHistory = fs.createReadStream(path.join(__dirname, 'general_history.data'));
    let generalHistoryOutput = '';
    readGeneralHistory.on('data', (chunk) => {
        generalHistoryOutput += chunk.toString('utf8');
    });

    readGeneralHistory.on('end', () => {
        sync = false;
    });

    while(sync){require('deasync').sleep(100);}
    return generalHistoryOutput;
}

function readMyHistory(){
    let sync = true;
    let readMyHistory = fs.createReadStream(path.join(__dirname, 'my_history.data'));
    let myHistoryOutput = '';
    readMyHistory.on('data', (chunk) => {
        myHistoryOutput += chunk.toString('utf8');
    });

    readMyHistory.on('end', () => {
        sync = false;
    });

    while(sync){require('deasync').sleep(100);}
    return myHistoryOutput;
}