var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mysql = require('mysql');
var path = require('path');
var AES = require("crypto");
var SHA256 = require("crypto-js/sha256");
var validator = require('validator');

var uppers = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
var numbers = "0123456789";
var characters = "~`!@#$%^&*()_+-=\\|][}{'\";:<>,./?";
// socket.email
// socket.userID
// socket.roomID
var charUserID;
var result_p;
var check_pass;
var roomArray = new Array();
var roomNameArray = new Array();
var emailSU;
var pwdSU;
var fnameSU;
var lnameSU;

// create MySQL connection
var conn = mysql.createConnection({
	host     : 'localhost',
	user     : 'root',
	password : '42$@@$MYpassword',
	database : 'chattestdb'
});

// connect to database
conn.connect(function(err) {
    if (err) throw err;
    // //console.log("Connected!");
});

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});

// point to file system "/public"
app.use(express.static(path.join(__dirname, '/public')));
app.use(express.static(path.join(__dirname, 'bower_components')));
	
// on user connect
io.on('connect', function(socket){
		// Function to retrieve room names 	
	function getRoomNames(userID, roomID, callback){
		conn.query('SELECT room_name FROM roomid WHERE roomID = ?', [roomID], function(err, result){
			if (err){
				callback(err,null);
			}
			else if (result.length > 0){
				callback(null,result[0].room_name);
			}
			else{
				callback(null,"");
			}
		});
	}
	
	function charToDB(name, roomID, userID, langs, callback){
		conn.query('INSERT INTO chars (userID, roomID, char_name, char_langs) VALUES (\'' + userID + '\', \'' + roomID + '\', \'' + name + '\', \'' + langs + '\')', function(err, result){
			if (err){
				callback(err, null);
			}
			else{
				callback(null, "success");
			}
		});
	}
	
	// FIXME: add another callback to store each characters in DB
	function addChar(name, roomID, email, langs, callback){
		var userID;
		conn.query('SELECT * FROM appusers WHERE email=\'' + email + '\'', function(err, result){
			if (err) {
				callback(err, null);
			}
			else if (result.length > 0){
				userID = result[0].userID;
				charToDB(name, roomID, userID, langs, function(err, result){
					if (err){
							callback(err, null);
					}
					else{
						callback(null, "success");
					}
				});
				//console.log(userID);
			}
			else{
				userID = 0;
				callback(null, "");
			}
		});
	}
	
	function trimmedLangs(rmID, chrName, chrLangs, callback){
		var tempLangs = chrLangs.split(",");
		var langs = new Array();
		
		for( var i = 0; i < tempLangs.length; i++){
			langs.push(tempLangs[i].split()); 
		}
		var charInfo = [rmID, chrName, langs];
		
		callback(null, charInfo);
	}
	
	function deleteEntireRoom(room, callback){
		conn.query('DELETE FROM roomid WHERE roomID=?', [room], function(err, result){
			if (err) {
				callback(err, null);	
			}
			else{
				callback(null, "success")
			}
		});
	}	

	function deleteRoomMessages(room, callback){
		console.log("Deleting messages where roomID=" + room + "...");
		conn.query('DELETE FROM messages WHERE roomID=?', [room], function(err, result){
			if (err){
				callback(err, null);
			}
			else{
				callback(null, "success");
			}
		});
	}

	function deleteRoomChars(room, char, callback){
		if (char == "GM"){
			conn.query('DELETE FROM chars WHERE roomid=?', [room], function(err, result){
				if(err){
					callback(err, null);
				}
				else{
					callback(null, "success");
				}
			});
		}
		else{
			conn.query('DELETE FROM chars WHERE roomid=? AND char_name=?', [room, char], function(err, result){
				if(err){
					callback(err, null);
				}
				else{
					callback(null, "success");
				}
			});
		}
	}

	// LOGIN/GET ROOM FUNCTIONS
	socket.on('check login', function(email, password){
		socket.email = sanitizeEmail(email);
		//console.log(socket.email);
		check_pass = sanitizeInputWS(password);
		//console.log(check_pass);
		//console.log("checking login...");
		
		conn.query('Select * FROM appusers WHERE email=\'' + socket.email + '\'', function(err, result){
			//console.log("Obtained login result from db...");
			if (err) throw err;
			else if (result.length > 0){	
				result_p = result[0].password;
				var sec = result[0].sec;
				var checkPass = SHA256(sec.substring(0, 15) + check_pass + sec.substring(16));
				//console.log("checking if passwords match...");
				if (result_p == checkPass){
					socket.userID = result[0].userID;
					sec = checkPass = result_p = check_pass = "";
					//console.log(socket.email + " " + socket.userID)
					conn.query('SELECT * FROM roomid WHERE userID=\'' + socket.userID + '\'', function(err, result){
						//console.log("Obtained result from roomid table...");
						if (err) throw err;
						else{
							if (result.length > 0){
								for (var i = 0; i < result.length; i++){
									var row = result[i];
									roomArray.push([row.roomID, "GM", "ALL"]);
									//console.log("Room from roomid table: " + row.roomID);
								}
							}
							else{
								// leave arrays empty
							}
							conn.query('SELECT * FROM chars WHERE userID=\'' + socket.userID + '\'', function(err, result){
								//console.log("Obtained result from chars table...");
								if (err) throw err;
								else{
									if (result.length > 0){
										for (var i = 0; i < result.length; i++){
											var row = result[i];
											trimmedLangs(row.roomID, row.char_name, row.char_langs, function(err, data){
												if (err) throw err;
												roomArray.push(data);
											});
											//roomArray.push([row.roomID, row.char_name, row.char_langs]);
											//console.log(roomArray[i]);
											//console.log("Room from chars table: " + row.roomID);
										}
									}
									else{
										// leave arrays empty
									}
									//console.log(roomArray);
									//console.log("Checking for room names from " + roomArray + "...");
									if (roomArray.length > 0){
										for (var i = 0; i < roomArray.length; i++){
											//console.log("Ran for loop to get names...");
											getRoomNames(socket.userID, roomArray[i][0], function(err, data){
												if (err) {
													// error handling code goes here
													throw err;            
												} 
												else{
													//console.log(data + " from callback");
													// code to execute on data retrieval
													roomNameArray.push(data);
													//console.log("result from db is : ",data);
													if (roomNameArray.length == roomArray.length){
														//console.log("login success!");
														//console.log(roomArray);
														//console.log(roomNameArray);
														socket.emit('login status', "success", socket.email, socket.userID, roomArray, roomNameArray);
													}	
												}
											});
										}
									}
									else{
										socket.emit('login status', "success", socket.email, socket.userID, roomArray, roomNameArray);
									}									
								}				
							});
						}
					});
				}
				else{
					//console.log("login failure!");
					socket.emit('login status', "fail", "null", "null", "null", "null");
				}	
			}
			else{
				//console.log("login failure!");
				socket.emit('login status', "fail", "null", "null", "null", "null");
			}
		});
			
	});
		
		// Connects users to all appropriate rooms
	socket.on('join room', function(room) { 
        //console.log('joining room ' + room + '...');
        socket.join(room); 
    })
	
		// reload room button list 
	 socket.on('reload rooms', function(userID, email){
		 roomArray = [];
		 roomNameArray = [];
		 socket.userID = userID;
		 socket.email = email;
		 conn.query('SELECT * FROM roomid WHERE userID=\'' + socket.userID + '\'', function(err, result){
			//console.log("Obtained result from roomid table...");
			if (err) throw err;
			else{
				if (result.length > 0){
					for (var i = 0; i < result.length; i++){
						var row = result[i];
						roomArray.push([row.roomID, "GM"]);
						//console.log("Room from roomid table: " + row.roomID);
					}
				}
				else{
					// leave arrays empty
				}
				conn.query('SELECT * FROM chars WHERE userID=\'' + socket.userID + '\'', function(err, result){
					//console.log("Obtained result from chars table...");
					if (err) throw err;
					else{
						if (result.length > 0){
							for (var i = 0; i < result.length; i++){
								var row = result[i];
								roomArray.push([row.roomID, row.char_name]);
								//console.log("Room from chars table: " + row.roomID);
							}
						}
						else{
							// leave arrays empty
						}
						//console.log(roomArray);
						//console.log("Checking for room names from " + roomArray + "...");
						if (roomArray.length > 0){
							for (var i = 0; i < roomArray.length; i++){
								//console.log("Ran for loop to get names...");
								getRoomNames(socket.userID, roomArray[i][0], function(err, data){
									if (err) {
										// error handling code goes here
										throw err;            
									} else {            
										// code to execute on data retrieval
										roomNameArray.push(data);
										//console.log("result from db is : ",data);
										if (roomNameArray.length == roomArray.length){
											//console.log("login success!");
											socket.emit('login status', "success", socket.email, socket.userID, roomArray, roomNameArray);
										}	
									}    
								});
							}
						}
						else{
							socket.emit('login status', "success", socket.email, socket.userID, roomArray, roomNameArray);
						}									
					}				
				});
			}
		});
	 });
	 
	// CREATE ACCOUNT FUNCTIONS
	socket.on('create account', function(fnameSU1, lnameSU1, emailSU1, pwdSU1, conpwdSU){
		var upperLettersNum = 0;
		var numberNum = 0;
		var specCharsNum = 0;
		pwdSU = sanitizeInputWS(pwdSU1);
		conpwdSU = sanitizeInputWS(conpwdSU);
		emailSU = sanitizeEmail(emailSU1);
		fnameSU = sanitizeInput(fnameSU1);
		lnameSU = sanitizeInput(lnameSU1);
		console.log(pwdSU.length);
		for (var i = 0; i < pwdSU.length; i++){
			var chrChk = pwdSU[i];
			console.log("Ran FOR loop...");
			if (uppers.includes(chrChk)){
				console.log("Contains upper...");
				upperLettersNum++;
			}
			else if(numbers.includes(chrChk)){
				console.log("Contains number...");
				numberNum++;	
			}
			else if(characters.includes(chrChk)){
				console.log("Contains character...");
				specCharsNum++;	
			}
			if(i == pwdSU.length - 1){
				console.log("Done iterating password...");
				if (upperLettersNum > 0 && numberNum > 0 && specCharsNum > 0 && pwdSU.length >= 8){
					if (pwdSU != conpwdSU){
						socket.emit('create account status', '!match');
					}
					else {
						conn.query('SELECT * FROM appusers WHERE email=\'' + emailSU + '\'', function(err, result){
							if (err) throw err;
							else if (result.length > 0){
								socket.emit('create account status', 'exists');
							}
							else {
								var sec = AES.randomBytes(16).toString('hex');
								//console.log(sec);
								var hashedpwd = SHA256(sec.substring(0, 15) + pwdSU + sec.substring(16));
								conn.query('INSERT INTO appusers (firstName, lastName, email, password, sec) VALUES (\'' + fnameSU + '\', \'' + lnameSU + '\', \'' + emailSU + '\', \'' + hashedpwd + '\', \'' + sec + '\')', function(err,result){
									if (err) throw err;
									else{
										fnameSU = lnameSU = emailSU = pwdSU = "";
										socket.emit('create account status', 'success');
									}
								});
							}
						});
					}
				}
				else{
					socket.emit('create account status', 'passwordFormat');
				}
			}
		}
		//console.log(pwdSU);
		//console.log(emailSU);
		//console.log(fnameSU);
		//console.log(lnameSU);
		console.log("Finished account creation...");
		
	});
	
	//ROOM CREATION FUNCTIONS
	socket.on('create room', function(roomName){
		// check for matches. If none, store in table
		roomName = sanitizeInput(roomName);
		//console.log(roomName);
		conn.query('SELECT * FROM roomid WHERE room_name=\'' + roomName + '\'' , function(err, result){
			if (err) throw err;
			if (result.length > 0){
				socket.emit('create room status', "badname");
			}
			else{
				var today = new Date();
				var date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
				//console.log(socket.userID);
				conn.query('INSERT INTO roomID (userID, room_name, lastMsg) VALUES (\'' + socket.userID + '\', \'' + roomName + '\', \'' + date + '\')' , function(err, result){
					if (err) throw err;
					else{
						conn.query('SELECT * FROM roomid WHERE room_name=\'' + roomName + '\'', function(err, result){
							if (err) throw err;
							socket.roomID = result[0].roomID;
							socket.emit('create room status', "success");
						});
					}
				});
			}
		});
	});
	
	// FIXME: Modify Callback function to include another callback...
	socket.on('create room chars', function(numChars, roomChars){
		//console.log(numChars);
		//console.log(roomChars);
		for (var i = 0; i < numChars; i++){
			var charName = sanitizeInput(roomChars[i][0]);
			//console.log(charName);
			var charEmail = sanitizeEmail(roomChars[i][1]);
			//console.log(charEmail);
			var charLangs = sanitizeInput(roomChars[i][2]);
			//console.log(charLangs);
			addChar(charName, socket.roomID, charEmail, charLangs, function(err, result){
				if (err) throw err;					
				else{
					if(result == "success"){
						//console.log(charName + " stored in db!");
					}
					else{
						console.log("Something went wrong!");
					}
				}
			});
			if (i == numChars - 1){
				socket.emit('char creation status', "success");
			}
		}
	});
	
	socket.on('cancel room creation', function(roomName){
		roomName = sanitizeInput(roomName);		
		conn.query('DELETE FROM roomid WHERE room_name=\'' + roomName + '\'', function(err, result){
			if (err) throw err;
			else{
				conn.query('DELETE FROM chars WHERE roomID=\'' + socket.roomID + '\'', function(err, result){
					if (err) throw err;
					else{
						socket.roomID = null;
					}
				});
			}
			//console.log("Room creation cancelled!");
		});
		
	});
	
	// on 'chat message', save message in database and emit to everyone in chat
	socket.on('chat message', function(msg, room, char, lang){
		msg = sanitizeInput(msg);
		var encMsg = msg.split('').sort(function(){return 0.5-Math.random()}).join(''); 
		//console.log('Saving message in db...');
		//console.log(encMsg);
		conn.query('INSERT INTO messages (userID, username, roomID, Message, encMessage, language) VALUES(\'' + socket.userID + '\', \'' + char + '\', \'' + room + '\', \'' + msg + '\', \'' + encMsg + '\', \'' + lang + '\')', function(err, result){  
			if (err) throw err;  
			//console.log("Message recorded!");  
			//console.log('Sending message to all clients...');
			io.sockets.in(room).emit('chat message', char, msg, encMsg, room, lang);
		});  
	});
	
	socket.on('delete room', function(room, character){
		if(character == "GM"){
			deleteEntireRoom(room, function(err, result){
				if (err) throw err;
				else{
					deleteRoomChars(room, character, function(err, result){
						if(err) throw err;
						else{
							//console.log("room " + room + " deleted!");
							deleteRoomMessages(room, function(err, result){
								if (err) throw err;
								else{
									console.log("Deleted all messages from this room!");
									socket.emit('deletion successful');
								}
							});
						}
					});
				}
			});
		}
		else{
			deleteRoomChars(room, character, function(err, result){
				if(err) throw err;
				else{
					//console.log("char " + character + " deleted!");
					socket.emit('deletion successful');
				}
			});
		}
	});

	// on 'disconnect' set all vars to null
	socket.on('disconnect', function(){
		//console.log("Disconnect server function running...");
		result_p = check_pass = null;
		roomArray = [];
		roomNameArray = [];
		//console.log("Server connection successfully disconnected!");
	});
	
});

function sanitizeInput(text){
	//console.log("Sanitizing input not WS...");
	text = validator.escape(text);
	text = text.replace("=", "");
	text = text.replace(";", "");
	
	return text;
}

function sanitizeInputWS(text){
	//console.log("Sanitizing input WS...");
	text = validator.escape(text);
	text = text.replace(" ", "");
	text = text.replace("=", "");
	text = text.replace(";", "");
	
	return text;
}

function sanitizeEmail(email){
	//console.log("Sanitizing email...");
	email = validator.escape(email);
	email = email.replace(" ", "");
	email = email.replace("=", "");
	email = email.replace(";", "");
	email = validator.normalizeEmail(email);

	return email;
}

// listen at localhost:3000
http.listen(3000, function(){
	//console.log('listening on *:3000');
});

