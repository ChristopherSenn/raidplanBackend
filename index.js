const express = require('express');



const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
var mysql = require('mysql');
var request = require('request');
var thenRequest = require('then-request');

var glob = require('glob');
//const express_static = require('express-static');

/*var corsOptions = {
    origin: 'http://localhost:4200',
    optionsSuccessStatements: 200
};*/

var connection = mysql.createConnection({
    //mysql in nodejs has issues with time zones. without this option, the 06.06.2018 is sent to the frontend as th 05.06.2018
    dateStrings: [
      'DATE',
      'DATETIME'
    ],
    host: 'localhost',
    user: 'root',
    password: 'cHr.1702',
    database: 'raidplan',
    multipleStatements: true
  });

const jwtKey = 'key';

const gw2APIAddress = 'https://api.guildwars2.com';

const app = express();

//app.use(express_static('/res/bosses'));

//app.use(cors(corsOptions));
app.use(bodyParser.json());

app.listen(8000, () => {
    console.log('Raidplan Backend Listening on Port 8000');
    setupRaidwingsInDatabase();
});
connection.connect();

app.post('/api/login', (req, res) => {
    let dbUser;
    console.log(req.body);
    // DB auth stuff
    connection.query(`SELECT id, email, apiKey from users WHERE email = '` + req.body.email + `' AND password = '` + req.body.password + `'`, function(err, results) {
        /*if (err) {
            throw err;
        }*/
  
        try {
            
            dbUser = {
                id: results[0].id,
                username: results[0].username,
                apiKey: results[0].apiKey
        };
        } catch (err) {
            res.sendStatus(401);
        }

        jwt.sign({dbUser}, jwtKey, {expiresIn: '5d'}, (err, token) => {
            if(err) res.sendStatus(404);
            res.json({
                id: dbUser.id,
                email: dbUser.username,
                apiKey: dbUser.apiKey,
                jwtToken: token
            });
        });
    });
});

app.post('/api/register', (req,res) => {
    console.log("called")
    connection.query(`INSERT INTO users (email, password, apiKey) SELECT '` + req.body.email + `', '` 
    + req.body.password + `', '` + req.body.apiKey + `' WHERE NOT EXISTS ( Select email from users WHERE email = '` + req.body.email + `') LIMIT 1;`, function(err, results) {
        //console.log(req.body)
        if(results.affectedRows == 0) {
            //Duplicate
            res.sendStatus(409);
        } else {
            console.log("inserted")
            dbUser = {
                id: results.insertId,
                username: req.body.email,
                apiKey: req.body.apiKey
            };
            //Successfull
            jwt.sign({dbUser}, jwtKey, {expiresIn: '5d'}, (err, token) => {
                if(err) res.sendStatus(404);
                console.log(results.insertId)
                res.json({
                    id: results.insertId,
                    email: req.body.email,
                    apiKey: req.body.apiKey,
                    jwtToken: token
                });
            });
            
        }
    })
});

app.get('/api/verifyJwtToken', verifyToken, (req,res) => {
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) {
            //console.log(err)
            res.sendStatus(403);
        } else {
            res.sendStatus(200);
        }
    })
});

app.get('/api/getBossIconList', (req,res) => {
    glob("./res/bosses/**", {}, function(er, files) {
        files.shift();
        for(let i = 0; i < files.length; i++) {
            files[i] = files[i].slice(1);
        }

        res.json(files);
    })
})

app.get('/api/getProfessionIconList', (req,res) => {
    glob("./res/professions/**", {}, function(er, files) {
        for(let i = 0; i < files.length; i++) {
            files[i] = files[i].slice(1);
        }
        files.splice(0,1);
        res.json(files)
    })
})

app.post('/api/getIconByPath', (req,res) => {
    //console.log(req.body)
    //res.sendStatus(404)
    res.sendFile(req.body.payload, {root: './'});
})


app.post('/api/compareVersions', (req, res) => {
    connection.query('SELECT version from app_version ORDER BY timestamp DESC LIMIT 1', function(err, results) {
        if(err) res.json(err)
        else{
            if(results[0].version.localeCompare(req.body.payload) == 0) {
                // No new Version
                console.log("matches")
                res.json(null)
            } else {
                console.log("doesnt match")
                console.log(results[0].version)
                res.json(results[0].version)
            }
            //console.log(results[0].version)
            //console.log(req.body.payload)
        }
    })
})

app.get('/createNewVersion', (req, res) => {
    connection.query('INSERT INTO app_version (version) VALUES ("' + generateVersionId() + '")', function(err){
        console.log(err)
    })
})

function generateVersionId() {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < 20; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
 }

app.get('/api/getRaidwings', verifyToken, (req, res) => {
    jwt.verify(req.token, jwtKey, (err, results) => {
        if(err) {
            res.sendStatus(403)
        } else {
            connection.query('SELECT id, name FROM raidwings', function(err, results) {
                if(err) res.json(err)
                else res.json(results)
            })
        }
    })
})

app.get('/api/getRaidwingById', verifyToken, (req, res) => {
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) {
            res.sendStatus(403);
        } else {
            connection.query(`SELECT id, name FROM raidwings WHERE id = ` + req.body.payload, function(err, results) {
                if(err) res.json(err)
                else res.json(results)
            })
        }
    })

})

app.post('/api/getRaidbossesByWingId', verifyToken, (req, res) => {
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) {
            res.sendStatus(403);
        } else {
            connection.query(`SELECT id, raidwingId, name FROM raidbosses WHERE raidwingId = ` + req.body.payload, function(err, results) {
                if(err) res.json(err)
                else res.json(results)
            })
        }
    })
})

app.get('/api/getRaidbossesOrderedByWing', verifyToken, (req, res) => {
    jwt.verify(req.token, jwtKey, (err) => {
        if(err) {
            res.sendStatus(403);
        } else {
            connection.query(`SELECT id, raidwingId, name FROM raidbosses WHERE type = 'Boss' ORDER BY id ASC`, function(err, results) {
                if(err) res.json(err)
                else res.json(results)
            })
        }
    })
});

app.post('/api/createRaid', verifyToken, (req,res) => {
    console.log(req.body.startDate)
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) {
            res.sendStatus(403);
        } else {
            //console.log(authData)
            var newDate = req.body.startDate.split('.');
            req.body.startDate = newDate[2] + '-' + newDate[1] + '-' + newDate[0];
            //console.log(d)
            connection.query(`INSERT INTO raidappointments (name, liRequirement, startDate, startTime, creatorId) VALUES ('` 
                + req.body.raidName + `', `+ req.body.liRequirement + `, '` + req.body.startDate + `', '` 
                + req.body.startTime + `', ` + authData.dbUser.id + `)`, function(err, results) {
                    if(err) res.json(err)
                    
                    let formattedPlayers = []
                    for(let i = 1; i < req.body.roles.length; i++) {
                        formattedPlayers.push([req.body.roles[i], req.body.professions[i], results.insertId])
                    }
                    connection.query( `INSERT INTO raidappointment_players (role, profession, raidappointmentId, userId) VALUES
                        ('` + req.body.roles[0] + `', '` + req.body.professions[0] + `', ` + results.insertId + `, ` + authData.dbUser.id + `)`,
                        function(err) {
                            if(err) res.json(err);
                            console.log(err);

                        })
                    var playerCall = 'INSERT INTO raidappointment_players (role, profession, raidappointmentId) VALUES ?';
                    connection.query(playerCall, [formattedPlayers], function(err){
                        if(err) res.json(err)
                        console.log(err)
                    })

                    let formattedWings = [];
                    for(let i = 0; i < req.body.wings.length; i++) 
                        formattedWings.push([req.body.wings[i], results.insertId]);

                    if(formattedWings.length > 0) {
                        var wingCall = 'INSERT INTO raidappointment_wings (raidwingId, raidAppointmentId) VALUES ?';
                        connection.query(wingCall, [formattedWings], function(err) {
                            if(err) res.json(err);
                            console.log(err);
                        })
                    }

                    let formattedBosses = [];
                    for(let i = 0; i < req.body.bossIds.length; i++) {
                        formattedBosses.push([req.body.bossIds[i], results.insertId]);
                    }
                    if(formattedBosses.length > 0) {
                        
                        var bossCall = 'INSERT INTO raidappointment_bosses (bossId, raidAppointmentId) VALUES ?';
                        connection.query(bossCall, [formattedBosses], function(err) {
                            if(err) res.json(err);
                            //console.log(err);
                        })
                    }
            })
            
        }
    })
})

app.get('/api/getRaidLfgOverview', verifyToken, (req,res) => {
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) res.sendStatus(403)
        else {
            connection.query(`SELECT id FROM raidappointments `, function(err, results) {
                let allRaidappointmentIds = [];
                for(let i = 0; i < results.length; i++) allRaidappointmentIds[i] = results[i].id
                console.log(allRaidappointmentIds);
                connection.query(`SELECT raidappointmentId AS id FROM raidappointment_players WHERE userId = ` + authData.dbUser.id, function(err, results){
                    let appointmantsNotToDisplay = [];
                    for(let i = 0; i < results.length; i++) appointmantsNotToDisplay[i] = results[i].id;
                    console.log(appointmantsNotToDisplay);
                    let appointmentsToDisplay = allRaidappointmentIds.filter(n => !appointmantsNotToDisplay.includes(n))
                    for(let i = 0; i < appointmentsToDisplay.length; i++) appointmentsToDisplay[i] = {id: appointmentsToDisplay[i]}
                    console.log(appointmentsToDisplay)
                    var arr = appointmentsToDisplay.map( function(el) { return el.id; });
                    connection.query(`SELECT id, name AS raidName, liRequirement, startDate, startTime FROM raidappointments WHERE id IN (` + arr + `) AND startDate >  DATE_SUB(curdate(), INTERVAL 1 DAY)`, function(err, results){
                        //console.log(err)
                        console.log(results)
                        if(err) res.json(err)
                        else res.json(results)
                    })
                    
                })
            })
        }
    })
})

app.get('/api/getMyRaidsOverview', verifyToken, (req,res) => {
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) res.sendStatus(403)
        else {
            connection.query(`SELECT raidappointmentId AS id FROM raidappointment_players WHERE userId = ` + authData.dbUser.id, function(err, results){
                //console.log(err);
                let appointmentsToDisplay = [];
                for(let i = 0; i < results.length; i++) appointmentsToDisplay[i] = results[i].id;
                console.log(appointmentsToDisplay);
                //let appointmentsToDisplay = allRaidappointmentIds.filter(n => !appointmantsNotToDisplay.includes(n))
                for(let i = 0; i < appointmentsToDisplay.length; i++) appointmentsToDisplay[i] = {id: appointmentsToDisplay[i]}
                console.log(appointmentsToDisplay)
                var arr = appointmentsToDisplay.map( function(el) { return el.id; });
                connection.query(`SELECT id, name AS raidName, liRequirement, startDate, startTime FROM raidappointments WHERE id IN (` + arr + `) AND startDate >  DATE_SUB(curdate(), INTERVAL 1 DAY)`, function(err, results){
                    console.log(err)
                    console.log(results)
                    if(err) res.json(err)
                    else res.json(results)
                })        
            })
        }
    })
})

app.get('/api/getProfessionIds', verifyToken, (req,res) => {
    jwt.verify(req.token, jwtKey, (err) => {
        if(err) res.sendStatus(403);
        else {
            connection.query('SELECT specId AS payload FROM profession_icons ORDER BY id ASC', function(err, results) {
                if(err) res.json(err)
                else res.json(results)
            })
        }
    })
})

app.post('/api/getFreeSlotsByRaidId', verifyToken, (req,res) => {
    jwt.verify(req.token, jwtKey, (err) => {
        if(err) res.sendStatus(403);
        else {
            connection.query(`SELECT id, role, profession FROM raidappointment_players WHERE userId IS NULL AND raidappointmentId = ` + req.body.payload, 
            function(err, results) {
                //console.log(req.body.payload)
                if(err) res.json(err);
                else res.json(results)
            })
        }
    })
})

app.post('/api/getPlayersByRaidId', verifyToken, (req,res) => {
    console.log("alsjdl")
    jwt.verify(req.token, jwtKey, (err) => {
        if(err) res.sendStatus(403)
        else {
            connection.query(`SELECT id, role, profession, userId FROM raidappointment_players WHERE userId IS NOT NULL AND raidappointmentId = ` + req.body.payload,
            function(err, results) {
                console.log(err)
                console.log(results)
                if(err) res.json(err)
                else res.json(results)
            })
        }
    })
})

app.post('/api/getPlayerNameById', verifyToken, (req,res) => {
    jwt.verify(req.token, jwtKey, (err) => {
        if(err) res.sendStatus(403)
        else {
            connection.query(`SELECT apiKey FROM users WHERE id = ` + req.body.payload, function(err, results) {
                request.get(gw2APIAddress + '/v2/account?access_token=' + results[0].apiKey, (error, response, body) => {
                    console.log(body)
                    if(err) res.json(err)
                    
                    else res.json(JSON.parse(body).name)
                })
                //console.log(results)
                //console.log(err)
                
            })
        }
    })
})

app.post('/api/playerSelectedRole', verifyToken, (req,res) => {
    //console.log(req.body + "aslkdjaslkd")
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) res.sendStatus(403);
        else {
            connection.query(`UPDATE raidappointment_players SET userId = ` + authData.dbUser.id + ` WHERE id = ` + req.body.payload,
            function(err) {
                if(err) res.json(err)
                console.log(err)
            });

        }
    })
})

app.get('/api/getUserData', verifyToken, (req,res) => {
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) res.sendStatus(403)
        else {
            connection.query(`SELECT email, apiKey FROM users WHERE id= ` + authData.dbUser.id, function(err, results) {
                console.log(results)
                res.json(results[0])
            })
        }
    })
})

app.post('/api/updateUserData', verifyToken, (req, res) => {
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) res.sendStatus(403)
        else {
            if(req.body.password == null || req.body.password == undefined || req.body.password.localeCompare("") == 0) {
                connection.query(`UPDATE users SET email = "` + req.body.email + `", apiKey = "` + req.body.apiKey + 
            `" WHERE id = ` + authData.dbUser.id, function(err, results) {
                console.log(err)
                console.log('Without Password')
            })
            }
            else {
                connection.query(`UPDATE users SET email = "` + req.body.email + `", password = "` + req.body.password + `", apiKey = "` + req.body.apiKey + 
            `" WHERE id = ` + authData.dbUser.id, function(err, results) {
                console.log('With Password')
            })
            }

        }
    })
})

app.get('/api/gw2API/getCharactersByUserId', verifyToken, (req, res) => {
    console.log("hi")
    jwt.verify(req.token, jwtKey, (err, authData) => {
        console.log(err)
        if(err) res.sendStatus(403)
        else {
            connection.query(`SELECT apiKey FROM users WHERE id = ` + authData.dbUser.id, function(err, results) {
                //console.log(results[0].apiKey)
                request.get(gw2APIAddress + '/v2/characters?access_token=' + results[0].apiKey, (error, response, body) => {
                    const characterNames = JSON.parse(body);
                    let toSend = [];
                    for(let i = 0; i < characterNames.length; i++) {
                        request.get(gw2APIAddress + '/v2/characters/' + characterNames[i] + '/specializations?access_token=' + results[0].apiKey, (error, response, body) => {
                            const character = JSON.parse(body);
                            toSend[i] = {name: characterNames[i], profession: character.specializations.pve[2].id};
                            //console.log(specs)
                            if(toSend.length == characterNames.length && !toSend.includes(undefined)){
                                console.log(toSend)
                                res.json(toSend)
                            }
                        })
                    }
                } )
            })
        }
    })
})

app.get('/api/gw2API/getAccountName', verifyToken, (req, res) => {
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) res.sendStatus(403)
        else {
            connection.query(`SELECT apiKey FROM users WHERE id = ` + authData.dbUser.id, function(err, results) {
                request.get(gw2APIAddress + '/v2/account?access_token=' + results[0].apiKey, (error, response, body) => {
                    const accountName = JSON.parse(body).name;
                    //console.log(accountName)
                    res.json(accountName);
                })
            })
        }
    })
})


//Without Key
app.post('/api/gw2API/customGeneralRequest', verifyToken, (req, res) => {
    //console.log(gw2APIAddress + req.body.payload)
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) {
            //console.log(err)
            res.sendStatus(403);
        } else {
           // console.log("fuckyou")
            request.get(gw2APIAddress + req.body.payload, (error, response , body) => {
                //console.log(JSON.parse(body))
                res.send(JSON.parse(body));
            });
        }
    });
});

//With Key
app.post('/api/gw2API/customPersonalRequest', verifyToken, (req, res) => {
    //console.log("asdljalsdja")
    jwt.verify(req.token, jwtKey, (err, authData) => {
        if(err) {
            res.sendStatus(403);
        } else {
            request.get(gw2APIAddress + req.body.path + "?access_token=" + req.body.apiKey, (error, response, body) => {
                res.send(response.body);
            });
        }
    });
});


function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearer = bearerHeader.split(' ');
        const bearerToken = bearer[1];
        req.token = bearerToken;
        return next();
    } else {
        res.sendStatus(401);
        return 0;
    }
  }

  function setupRaidwingsInDatabase() {

    
    //connection.query('DELETE FROM raidbosses WHERE id > 0', function(err){})
    //connection.query('DELETE FROM raidwings WHERE id > 0', function(err){
    //    if(err)console.log(err)
    //})

    
      request.get(gw2APIAddress + '/v2/raids', (error, response, body) => {
        const raidThingyList = JSON.parse(body);
        const wingList = [];

        for(let i = 0; i < raidThingyList.length; i++) {
            request.get(gw2APIAddress + '/v2/raids/' + raidThingyList[i], (error, response, body) => {
                const rawWingList = JSON.parse(body);
                //console.log(i);
                //console.log(rawWingList.wings)
                wingList[i] = rawWingList;
                //console.log(wingList)
                /**
                 * Fuck async calls undso
                 */
                if(!wingList.includes(undefined) && wingList.length == raidThingyList.length) {
                    //console.log(wingList[4].wings[0].events)

                    var wingNames = [];
                    let wingCounter = 1;
                    wingList.forEach(element => {
                        
                        element.wings.forEach(wing => {
                            wingNames.push([wing.id, wingCounter]);
                            //console.log(wing.events)
                            wingCounter++;
                        });

                    });
                    var call = 'INSERT IGNORE INTO raidwings (name, id) VALUES ?';
                    connection.query(call, [wingNames], function(err) {
                        if(err) console.log(err);
                    });

                    wingCounter = 1;
                    bossConter = 1;
                    wingList.forEach(element => {
                        element.wings.forEach(wing => {
                            //console.log(wing)
                            wing.events.forEach(encounter => {
                                connection.query(`INSERT IGNORE INTO raidbosses (id, name, raidwingId, type) VALUES (` + bossConter + `, '` + encounter.id + `', ` + wingCounter + `, '` + encounter.type + `')`, function(err) {
                                    if(err) console.log(err)
                                })
                                bossConter++;
                            })
                            wingCounter++;
                        })
                    })

                }

            })
        }
        //console.log(wingList)

        /*raidThingyList.forEach(raidThingys => {
            request.get(gw2APIAddress + '/v2/raids/' + raidThingys, (error, response, body) => {
                const wingList = JSON.parse(body);
                console.log(wingList.wings)

            })
        })*/

      });
  }


















  /*app.get('/api/createSampleRaids', (req,res) => {
    //console.log(req.body.startDate)

            //console.log(authData)
            var newDate = req.body.startDate.split('.');
            req.body.startDate = newDate[2] + '-' + newDate[1] + '-' + newDate[0];
            //console.log(d)
            raidData = [
                {name: 'testRaid1', liRequirement: 150, startDate: '2019-12-16', startTime: '18:00', creatorId: 1},
                {name: 'testRaid2', liRequirement: 50, startDate: '2019-12-16', startTime: '19:00', creatorId: 2},
                {name: 'testRaid3', liRequirement: 250, startDate: '2019-12-16', startTime: '20:00', creatorId: 3},
            ]
            creatorData = [
                {role: 'tank', profession: 'Mesmer', userId: 1},
                {role: 'tank', profession: 'Warrior', userId: 2},
                {role: 'tank', profession: 'Thief', userId: 3},
            ]

            playerData = [
                [
                    {role: 'dps', profession:'Guardian'},
                    {role: 'dps', profession:'Guardian'},
                    {role: 'dps', profession:'Guardian'},
                    {role: 'dps', profession:'Guardian'},
                    {role: 'dps', profession:'Guardian'},
                    {role: 'dps', profession:'Guardian'},
                    {role: 'dps', profession:'Guardian'},
                    {role: 'dps', profession:'Guardian'},
                    {role: 'dps', profession:'Guardian'}
                ],
                [
                    {role:'druid', profession:'Druid'},
                    {role:'druid', profession:'Druid'},
                    {role:'druid', profession:'Druid'},
                    {role:'druid', profession:'Druid'},
                    {role:'druid', profession:'Druid'},
                    {role:'druid', profession:'Druid'},
                    {role:'druid', profession:'Druid'},
                    {role:'druid', profession:'Druid'},
                    {role:'druid', profession:'Druid'}
                ],
                [
                    {role:'cdps', profession:'Engineer'},
                    {role:'cdps', profession:'Engineer'},
                    {role:'cdps', profession:'Engineer'},
                    {role:'cdps', profession:'Engineer'},
                    {role:'cdps', profession:'Engineer'},
                    {role:'cdps', profession:'Engineer'},
                    {role:'cdps', profession:'Engineer'},
                    {role:'cdps', profession:'Engineer'},
                    {role:'cdps', profession:'Engineer'}   
                ]
            ]

            raidWings = [
                {raidwingId: 1},
                {raidwingId: 2},
                {raidwingId: 3}
            ]

            for(let i = 0; i < )
            connection.query(`INSERT INTO raidappointments (name, liRequirement, startDate, startTime, creatorId) VALUES ('` 
                + req.body.raidName + `', `+ req.body.liRequirement + `, '` + req.body.startDate + `', '` 
                + req.body.startTime + `', ` + authData.dbUser.id + `)`, function(err, results) {
                    if(err) res.json(err)
                    
                    let formattedPlayers = []
                    for(let i = 1; i < req.body.roles.length; i++) {
                        formattedPlayers.push([req.body.roles[i], req.body.professions[i], results.insertId])
                    }
                    connection.query( `INSERT INTO raidappointment_players (role, profession, raidappointmentId, userId) VALUES
                        ('` + req.body.roles[0] + `', '` + req.body.professions[0] + `', ` + results.insertId + `, ` + authData.dbUser.id + `)`,
                        function(err) {
                            if(err) res.json(err);
                            console.log(err);

                        })
                    var playerCall = 'INSERT INTO raidappointment_players (role, profession, raidappointmentId) VALUES ?';
                    connection.query(playerCall, [formattedPlayers], function(err){
                        if(err) res.json(err)
                        console.log(err)
                    })

                    let formattedWings = [];
                    for(let i = 0; i < req.body.wings.length; i++) 
                        formattedWings.push([req.body.wings[i], results.insertId]);

                    if(formattedWings.length > 0) {
                        var wingCall = 'INSERT INTO raidappointment_wings (raidwingId, raidAppointmentId) VALUES ?';
                        connection.query(wingCall, [formattedWings], function(err) {
                            if(err) res.json(err);
                            console.log(err);
                        })
                    }

                    let formattedBosses = [];
                    for(let i = 0; i < req.body.bossIds.length; i++) {
                        formattedBosses.push([req.body.bossIds[i], results.insertId]);
                    }
                    if(formattedBosses.length > 0) {
                        var bossCall = 'INSERT INTO raidappointment_bosses (bossId, raidAppointmentId) VALUES ?';
                        connection.query(bossCall, [formattedBosses], function(err) {
                            if(err) res.json(err);
                            //console.log(err);
                        })
                    }
            })
            
})*/
