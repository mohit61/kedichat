const io = require('socket.io').listen(3600);
const work = require('work-token/sync');
const sha256 = require('sha256');
const openpgp = require('openpgp');
var ss = require('socket.io-stream');
const fs = require('fs');
const path = require('path');

let general_history = [];
let count = 0;
let last_emited_history = '';
let most_recorded_count = 0;
let most_recorded_hash;

io.sockets.on('connection', function(socket){
    count++;
    socket.on('disconnect', ()  => {
        count--;
    });
    socket.on('sendMessage', (data) => {
        console.log(data.senderPubKey);
        console.log(data.signature);
        if(verifySomething(data.senderPubKey, data.signature)){
            //socket.emit('receiveMessage', data)
            socket.broadcast.emit('receiveMessage', {
                senderPubKey: data.senderPubKey,
                message: data.message,
                timestamp: data.timestamp
            })
            console.log('emited');
        }else {
            console.log("Couldn't verify.");
        }

    });

    socket.on('syncHistory', (data) => {
        if(data == 'askGeneralHistory'){
            socket.broadcast.emit('syncHistory');
        }else {
            general_history.push(data);
            if(general_history.length > ((count*90)/100)){
                var counts = {};
            

                for(var i=0;i< general_history.length;i++){
                    var key = general_history[i];
                    counts[key] = (counts[key])? counts[key] + 1 : 1 ;
                }

                for(let i = 0; i < general_history.length; i++){
                    if(counts[general_history[i]] > most_recorded_count){
                        most_recorded_count = counts[general_history[i]];
                        most_recorded_hash = general_history[i];
                    }
                }
                
                socket.emit('sendUsHistory', most_recorded_hash);
                socket.broadcast.emit('sendUsHistory', most_recorded_hash);
                console.log('Most Recorded Hash: ' + most_recorded_hash);
                most_recorded_count = 0;
                most_recorded_hash = '';
                general_history = [];
            }
        }
        
    });

    socket.on('sendingHistory', (data) => {
        if(last_emited_history != data.sign){
            last_emited_history = data.sign;
            socket.emit('updatedHistory', data);
            socket.broadcast.emit('updatedHistory', data);
        }
    });

});

function verifySomething(pubkey,signature){
    let sync = true;
    let result;
    const verifySomething = async() => {
    options = {
    message: await openpgp.message.readArmored(signature), // parse armored message
    publicKeys: (await openpgp.key.readArmored(pubkey)).keys // for verification
    };
    
        openpgp.verify(options).then(function(verified) {
            validity = verified.signatures[0].valid; // true
            if (validity) {
                result = true;
                sync = false;
            }else {
                result = false;
                sync = false;
            }
        });
    }
    verifySomething();
    
    while(sync){ require('deasync').sleep(100);}
    return result;
    
    }
  