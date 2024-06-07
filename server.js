const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "https://structome-mfbi2.ondigitalocean.app/",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});

app.use(express.static('/workspace/build'));

// catch-all handler for any request that doesn't match one above, send back the index.html file
app.get('*', (req, res) => {
    res.sendFile('/workspace/build/index.html');
});


const PORT = process.env.PORT || 8080;

const playerProperties = {
    ids: [1, 2, 3, 4, 5],
    colors: ["aqua", "red", "chartreuse", "blueviolet", "yellow"] // colors for players
};

const gameRooms = {};

const FRAMERATE = 12;
const BASTIONCOST = 20;
const BRIDGECOST = 20;
const NUKECOST = 70;
const NODECOST = 10;
const POISON_COST = 60;
const FREEZE_COST = 10;
const RAGE_COST = 15;
const TWOWAY_BRIDGECOST = 15;
const CANNON_COST = 100;

const POISON_DURATION = 160;

const INCOMERATE = 1;
const MONEYNODEBONUS = 1;
const MAXNODESIZE = 800;
const TRANSFER = 0.15;
const GROWTHRATE = 1;
const COLORNEUTRAL = 'white';

function generateRandomGraph() {
    const nodes = [], edges = [];
    const numNodes = 50, minDistance = 90, money = [10, 10, 10, 10, 10];
    
    const centerX = 1560 / 2 + 20; //finds middle of the screen
    const centerY = 860 / 2 + 20;
    
    for (let i = 0; i < numNodes; i++) {
        let newNode;
        do {
            newNode = {
                id: i,
                x: (Math.random() * 1560)+20, //changed math so node isnt on edge of screen
                y: (Math.random() * 860)+20,
                size: 45,
                owner: COLORNEUTRAL,
                moneynode: false,
                rage: false,
                cannon: false,
                poison: 0
            };
        } while (nodes.some(node => getDistance(newNode, node) < minDistance)); //choose most central node without edges
        nodes.push(newNode);
    }

    for (let i = 0; i < numNodes; i++) {
        for (let j = i + 1; j < numNodes; j++) {
            const potentialEdge = { from: nodes[i].id, to: nodes[j].id, flowing: false, twoway: Math.random() < 1 / 3, reversed: false};

            if (Math.random() < calculateEdgeProbability(nodes[i], nodes[j]) && !doesEdgeOverlap(potentialEdge, edges, nodes)) {
                edges.push(potentialEdge);
            }
        }
    }

    // find nodes without edges
    const nodesWithoutEdges = nodes.filter(node =>
        !edges.some(edge => edge.from === node.id || edge.to === node.id)
    );

    if (nodesWithoutEdges.length > 0) {
        const closestNode = nodesWithoutEdges.reduce((closest, node) => {
            const distToCenter = getDistance({ x: centerX, y: centerY }, node);
            const closestDistToCenter = getDistance({ x: centerX, y: centerY }, closest);
            return distToCenter < closestDistToCenter ? node : closest;
        }, nodesWithoutEdges[0]); // initialize with the first node without edges
        // mark the closest node as a money node
        closestNode.moneynode = true;
        closestNode.size = 1600;
    }

    return { nodes, edges, money };
}

function getDistance(nodeA, nodeB) {
    return Math.hypot(nodeA.x - nodeB.x, nodeA.y - nodeB.y);
}

function calculateEdgeProbability(nodeA, nodeB) {
    const distance = getDistance(nodeA, nodeB);
    const maxDistance = Math.hypot(1600, 900);
    return Math.pow((maxDistance - distance) / maxDistance, 12);
}

//helper functions for line intersection or lines being too close together
function calculateEdgeAngle(p1, p2) {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

function pointToLineDistance(point, lineStart, lineEnd) {
    const l2 = Math.pow(lineStart.x - lineEnd.x, 2) + Math.pow(lineStart.y - lineEnd.y, 2);
    if (l2 === 0) return getDistance(point, lineStart); // lineStart and lineEnd are the same point

    let t = ((point.x - lineStart.x) * (lineEnd.x - lineStart.x) + (point.y - lineStart.y) * (lineEnd.y - lineStart.y)) / l2;
    t = Math.max(0, Math.min(1, t)); // Clamp t to the range [0, 1]

    const projection = { x: lineStart.x + t * (lineEnd.x - lineStart.x), y: lineStart.y + t * (lineEnd.y - lineStart.y) };
    return getDistance(point, projection);
}

function doLinesIntersect(p1, q1, p2, q2) {
    // get coordinates from the points
    const x1 = p1.x, y1 = p1.y, x2 = q1.x, y2 = q1.y;
    const x3 = p2.x, y3 = p2.y, x4 = q2.x, y4 = q2.y;

    // check for zero length lines
    if ((x1 === x2 && y1 === y2) || (x3 === x4 && y3 === y4)) {
        return false;
    }

    // check that there isnt already an edge between these two nodes
    if ((x1 === x3 && y1 === y3) || (x1 === x4 && y1 === y4) ||
        (x2 === x3 && y2 === y3) || (x2 === x4 && y2 === y4)) {
        return false;
    }

    const denominator = ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));

    // lines are parrallel
    if (denominator === 0) {
        return false;
    }

    let ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator;
    let ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator;

    // check if the intersection is along the segments (excluding endpoints)
    if (ua <= 0 || ua >= 1 || ub <= 0 || ub >= 1) {
        return false;
    }

    // if we reach here, lines intersect (not at endpoints)
    return true;
}

// Function to check if the new edge overlaps with existing edges
function doesEdgeOverlap(newEdge, existingEdges, nodes, proximityThreshold = 10, angleThreshold = Math.PI / 12) {
    // Check if an edge already exists directly between the same two nodes
    if (existingEdges.some(edge => (edge.from === newEdge.from && edge.to === newEdge.to) || (edge.from === newEdge.to && edge.to === newEdge.from))) {
        return true; // An edge already connects these nodes, so consider it an overlap
    }

    const newEdgeStart = nodes.find(node => node.id === newEdge.from);
    const newEdgeEnd = nodes.find(node => node.id === newEdge.to);
    if (!newEdgeStart || !newEdgeEnd) return false; // Ensure both nodes exist

    const newEdgeAngle = calculateEdgeAngle(newEdgeStart, newEdgeEnd);

    for (const edge of existingEdges) {
        const existingEdgeStart = nodes.find(node => node.id === edge.from);
        const existingEdgeEnd = nodes.find(node => node.id === edge.to);
        if (!existingEdgeStart || !existingEdgeEnd) continue; // Skip if nodes don't exist

        // Check for actual line intersection excluding endpoints
        if (doLinesIntersect(newEdgeStart, newEdgeEnd, existingEdgeStart, existingEdgeEnd)) {
            return true; // The new edge technically intersects with an existing edge
        }

        // Add any additional overlap checks here (e.g., based on proximity and angle)
    }

    return false; // No direct connection, intersection, or indistinguishable overlap found
}


function updateGameState(roomId) {
    const room = gameRooms[roomId];
    if (room && room.gameState) {
        room.tickCount += 1;
        //Delete room if gone on for too long
        if (room.tickCount > 60000) {
            console.log(`Tick count exceeded 60,000 for room ${roomId}. Deleting room.`);
            if (room.gameLoopIntervalId) {
                clearInterval(room.gameLoopIntervalId);
            }
            // Optionally, notify players that the room is being deleted
            io.to(roomId).emit('roomDeleted', { message: 'Game over. Room has been deleted due to tick count limit.' });
            delete gameRooms[roomId];
            return;
        }


        const { gameState } = room;

        // Grow nodes
        if (room.tickCount % 3 !== 0) { //Reduce growth rate by a Third (probably change this later as its messy)
            gameState.nodes.forEach(node => {
                const maxSize = node.rage ? 3 * MAXNODESIZE : MAXNODESIZE; //Triple max node size if rage node
                if (node.owner !== COLORNEUTRAL && node.owner !== 'black' && node.size < maxSize && node.poison <= 0) {
                    node.size = node.size + GROWTHRATE;
                }
                if (node.size > GROWTHRATE+1 && node.poison > 0){ //poison subtracts double the growth rate
                    node.size = node.size - GROWTHRATE*2;
                    node.poison = node.poison - 1;
                }
                if (node.poison > 0) { 
                    if (node.size > GROWTHRATE*2){
                        node.size = node.size - GROWTHRATE * 2; //poison subtracts double the growth rate
                    }
                    node.poison = node.poison - 1;
                }

            });
        }
        // Increment money for each player
        if (room.tickCount % 12 === 0) {
            let additionalIncome = new Array(room.gameState.money.length).fill(0);
            let nodesOwned = new Array(room.gameState.money.length).fill(0);
            // Iterate through all nodes to calculate additional income from money nodes
            room.gameState.nodes.forEach(node => {
                if (node.owner !== COLORNEUTRAL && node.owner !== 'black') {
                    // Find the player object whose color matches the node owner
                    const player = Object.values(room.players).find(p => p.color === node.owner);
                    if (player) {
                        // Assuming player IDs are 1-indexed and correspond to the indices in the 'money' array by (id - 1)
                        const playerIndex = player.id - 1; // Convert player ID to 0-based index
                        if (playerIndex >= 0 && playerIndex < additionalIncome.length) {
                            if (node.moneynode){
                                additionalIncome[playerIndex] += 1; // Add 1 income for each money node owned
                            }
                            nodesOwned[playerIndex] += 1; //Nodes owned count
                        }
                    }
                }
            });

            room.gameState.money = room.gameState.money.map((m, index) => m + (nodesOwned[index] !== 0 ? INCOMERATE : 0) + MONEYNODEBONUS * additionalIncome[index]);
        }
        // Update edges
        const originalSizes = new Map(); //stored original node sizes for calculations
        gameState.nodes.forEach(node => {
            originalSizes.set(node.id, node.size);
        });

        gameState.edges.forEach(edge => {
            if (edge.flowing) {
                const fromNode = edge.reversed
                    ? room.gameState.nodes.find(node => node.id === edge.to) //opposite if reversed
                    : room.gameState.nodes.find(node => node.id === edge.from);
                const toNode = edge.reversed
                    ? room.gameState.nodes.find(node => node.id === edge.from)
                    : room.gameState.nodes.find(node => node.id === edge.to);
                const originalFromSize = originalSizes.get(fromNode.id); //use original mnode size
                
                if (fromNode && toNode && originalFromSize >= 30 && fromNode.owner !== COLORNEUTRAL) { // Ensure at least size 30 to attack or transfer and make sure its not a neutral node attacking
                    const transferAmount = Math.min(Math.ceil(originalFromSize * TRANSFER), fromNode.size-1); //calculate transfer amount, dont go over the actual fromNode size
                    
                    if (fromNode.owner === toNode.owner) { // If same color nodes, transfer, otherwise fight
                        const maxSize = toNode.rage ? 3 * MAXNODESIZE : MAXNODESIZE; //Triple max node size if rage node
                        if (toNode.size < maxSize) {
                            fromNode.size -= transferAmount; // Transfer from fromNode to toNode
                            toNode.size += transferAmount; 
                            if (fromNode.poison > 0 && toNode.poison <= 0) { // Transfer poison status
                            }
                        }
                    } else {
                        fromNode.size -= transferAmount; //Attack, subtract fromnode
                        if (toNode.size < 50) {
                            toNode.size -= transferAmount; // If toNode size is less than 50, apply normal damage
                        } else {
                            toNode.size -= Math.ceil(transferAmount * 1.5); // If toNode size is 50 or more, apply increased damage
                        }
                        if (fromNode.poison > 0 && toNode.poison <= 0) { // Transfer poison status
                            toNode.poison = fromNode.poison; 
                        }

                        if (toNode.size <= 0) {
                            toNode.owner = fromNode.owner; // Switch the color of the node if 'to' node's size drops to 0 or below
                            toNode.size = Math.max(1, transferAmount+toNode.size); // Ensure the 'to' node has at least size 1 or the transfer amount after the color switch
                        }
                    }
                }
            }
        });

        // broadcast the updated game state to all clients in the room
        io.to(roomId).emit('graphData', gameState);
        //console.log(gameState);
    }
}


io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('createRoom', (numPlayers) => {
        const roomId = crypto.randomBytes(2).toString('hex');

        if (numPlayers > playerProperties.ids.length) {
            socket.emit('error', 'Maximum number of players exceeded');
            return;
        }

        gameRooms[roomId] = {
            gameState: generateRandomGraph(),
            players: {}, // initialize as empty and players will be added as they join
            maxPlayers: numPlayers, // store the maximum number of players allowed
            tickCount: 0
        };

        // add the room creator as the first player
        gameRooms[roomId].players[socket.id] = {
            id: playerProperties.ids[0],
            color: playerProperties.colors[0]
        };

        socket.join(roomId);
        // emit room creation confirmation along with player info
        socket.emit('roomCreated', { roomId, playerInfo: gameRooms[roomId].players[socket.id] });

    });

    socket.on('joinRoom', (roomId) => {
        const room = gameRooms[roomId];
        if (room) {
            const playerCount = Object.keys(room.players).length;
            if (playerCount < room.maxPlayers) {
                // Add the player to the room
                const newPlayerIndex = playerCount;
                room.players[socket.id] = {
                    id: playerProperties.ids[newPlayerIndex],
                    color: playerProperties.colors[newPlayerIndex]
                };
                socket.join(roomId);
                socket.emit('playerInfo', room.players[socket.id]);
                io.to(roomId).emit('graphData', room.gameState);

                // check if the room is now full
                if (playerCount + 1 === room.maxPlayers) {
                    // start the game loop only when the room is full
                    room.gameLoopIntervalId = setInterval(() => updateGameState(roomId), 1000 / FRAMERATE);
                }
            } else {
                socket.emit('roomFull', roomId);
            }
        } else {
            socket.emit('roomNotFound', roomId);
        }
    });

    socket.on('updateNodeOwner', ({ roomId, nodeId }) => {
        console.log('NodeClickedOn: '+nodeId);
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const node = room.gameState.nodes.find(node => node.id === nodeId);
            if (node && node.owner === COLORNEUTRAL && !node.moneynode && room.gameState.money[player.id - 1] >= NODECOST) {
                node.owner = player.color;
                node.size = 1;
                room.gameState.money[player.id - 1] -= NODECOST;
                io.to(roomId).emit('graphData', room.gameState);
            } else {
                socket.emit('errormsg', { message: 'Error or Insufficient funds. Cost: ' + NODECOST });
            }
        }
    });

    socket.on('bastion', ({ roomId, nodeId }) => {
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const node = room.gameState.nodes.find(node => node.id === nodeId);

            if (node && node.owner === player.color) {
                if (room.gameState.money[player.id - 1] >= BASTIONCOST) {
                    node.owner = 'black'; // Change the node's color to not neutral so it can't be clicked
                    node.size = 4 * node.size + 200; // Triple the node's size
                    room.gameState.money[player.id - 1] -= BASTIONCOST; // Subtract BASTIONCOST from the player
                    io.to(roomId).emit('graphData', room.gameState);
                    console.log('Bastion successfully activated on node ' + nodeId);
                } else {
                    console.log('Bastion activation failed: Insufficient funds');
                    socket.emit('errormsg', { message: 'Insufficient funds. Cost: ' + BASTIONCOST });
                }
            } else {
                console.log('Bastion activation failed: Node not owned by player or does not exist');
                socket.emit('errormsg', { message: 'Node not owned' });
            }
        }
    });

    socket.on('nuke', ({ roomId, nodeId }) => {
        console.log('Nuke activated on node: ' + nodeId);
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const nodeIndex = room.gameState.nodes.findIndex(node => node.id === nodeId);

            //check that node exists and node is not owned by the player
            if (nodeIndex !== -1 && room.gameState.nodes[nodeIndex].owner !== player.color && !room.gameState.nodes[nodeIndex].moneynode) {
                //check and subtract money
                if (room.gameState.money[player.id - 1] >= NUKECOST) {
                    room.gameState.money[player.id - 1] -= NUKECOST;
                    //delete node
                    room.gameState.nodes.splice(nodeIndex, 1);
                    //delete edges connected to node
                    room.gameState.edges = room.gameState.edges.filter(edge => edge.from !== nodeId && edge.to !== nodeId);
                    //send game state to everyone
                    io.to(roomId).emit('graphData', room.gameState);
                    console.log('Nuke successfully activated on node ' + nodeId);
                } else {
                    console.log('Nuke activation failed: Insufficient funds');
                    socket.emit('errormsg', { message: 'Insufficient funds. Cost: ' + NUKECOST });
                }
            } else {
                console.log('Nuke activation failed: Node owned by player or does not exist');
                socket.emit('errormsg', { message: 'Node is owned by you or is a money node' });
            }
        }
    });

    socket.on('poison', ({ roomId, nodeId }) => {
        console.log('Poison activated on node: ' + nodeId);
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const node = room.gameState.nodes.find(node => node.id === nodeId);
            if (node && node.owner !== player.color) { //node not owner by player & exists
                // Check and subtract money
                if (room.gameState.money[player.id - 1] >= POISON_COST) { 
                    room.gameState.money[player.id - 1] -= POISON_COST; //Change cost of 30 to Global Var later
                    node.poison = POISON_DURATION;
                    io.to(roomId).emit('graphData', room.gameState);
                    console.log('Poison successfully activated on node ' + nodeId);
                } else {
                    console.log('Poison activation failed: Insufficient funds');
                    socket.emit('errormsg', { message: 'Insufficient funds. Cost: ' + POISON_COST });
                }
            } else {
                console.log('Poison activation failed: Node owned by player or does not exist');
                socket.emit('errormsg', { message: 'Poison activation failed: Node owned by you or does not exist' });
            }
        }
    });

    socket.on('rage', ({ roomId, nodeId }) => {
        console.log('Rage activated on node: ' + nodeId);
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const node = room.gameState.nodes.find(node => node.id === nodeId);
            if (node && node.owner === player.color) { // Node owned by player
                if (room.gameState.money[player.id - 1] >= RAGE_COST) {
                    room.gameState.money[player.id - 1] -= RAGE_COST;
                    node.rage = true;
                    io.to(roomId).emit('graphData', room.gameState);
                    console.log('Rage successfully activated on node ' + nodeId);
                } else {
                    console.log('Rage activation failed: Insufficient funds');
                    socket.emit('errormsg', { message: 'Insufficient funds. Cost: ' + RAGE_COST });
                }
            } else {
                console.log('Rage activation failed: Node not owned by player or does not exist');
                socket.emit('errormsg', { message: 'Rage activation failed: Node owned by you or does not exist' });
            }
        }
    });

    socket.on('cannon', ({ roomId, nodeId }) => {
        console.log('Cannon activated on node: ' + nodeId);
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const node = room.gameState.nodes.find(node => node.id === nodeId);
            if (node && node.owner === player.color) { // Node owned by player
                if (room.gameState.money[player.id - 1] >= CANNON_COST) {
                    room.gameState.money[player.id - 1] -= CANNON_COST;
                    node.cannon = true;
                    io.to(roomId).emit('graphData', room.gameState);
                    console.log('Cannon successfully activated on node ' + nodeId);
                } else {
                    console.log('Cannon activation failed: Insufficient funds');
                    socket.emit('errormsg', { message: 'Insufficient funds. Cost: ' + CANNON_COST });
                }
            } else {
                console.log('Cannon activation failed: Node not owned by player or does not exist');
                socket.emit('errormsg', { message: 'Cannon activation failed: Node owned by you or does not exist' });
            }
        }
    });

    socket.on('updateEdgeFlowing', ({ roomId, edgeId, flowing }) => {
        console.log('edge left clicked on: '+edgeId);
        const room = gameRooms[roomId];
        if (room) {
            const edge = room.gameState.edges.find(edge => `${edge.from}-${edge.to}` === edgeId);
            if (edge) {
                const fromNode = edge.reversed
                    ? room.gameState.nodes.find(node => node.id === edge.to)    // If 'edge.reversed' is true
                    : room.gameState.nodes.find(node => node.id === edge.from);
                const currentPlayer = room.players[socket.id];
                if (fromNode && currentPlayer && fromNode.owner === currentPlayer.color) {
                    edge.flowing = flowing;
                    io.to(roomId).emit('graphData', room.gameState);
                }
            }
        }
    });

    socket.on('freezeEdge', ({ roomId, edgeId }) => {
        console.log('edge freeze request: ' + edgeId);
        const room = gameRooms[roomId];
        if (room) {
            const edge = room.gameState.edges.find(edge => `${edge.from}-${edge.to}` === edgeId);
            const currentPlayer = room.players[socket.id];
            const fromNode = edge.reversed ? room.gameState.nodes.find(node => node.id === edge.to)
                : room.gameState.nodes.find(node => node.id === edge.from);
            if (edge && edge.twoway && fromNode && fromNode.owner === currentPlayer.color) {
                if (room.gameState.money[currentPlayer.id - 1] >= FREEZE_COST) { //money check
                    edge.twoway = false;
                    room.gameState.money[currentPlayer.id - 1] -= FREEZE_COST;
                    io.to(roomId).emit('graphData', room.gameState);
                    console.log(`Edge ${edgeId} frozen successfully.`);
                } else {
                    console.log('Freeze action failed: Insufficient funds'); //can maybe delete error messages at some point
                    socket.emit('errormsg', { message: 'Insufficient funds. Cost: ' + FREEZE_COST });
                }
            } else {
                console.log('Freeze action failed: Edge does not exist or is not two-way');
                socket.emit('errormsg', { message: 'From node is not owned by you or edge cant be frozen' });
            }
        }
    });

    socket.on('buildEdge', ({ roomId, from, to }) => {
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const fromNode = room.gameState.nodes.find(node => node.id === from);
            const toNode = room.gameState.nodes.find(node => node.id === to);

            // Check if the 'from' node is owned by the player and the player has enough money
            if (fromNode && toNode && fromNode.owner === player.color && room.gameState.money[player.id - 1] >= BRIDGECOST) {
                const newEdge = { from: fromNode.id, to: toNode.id, flowing: false, twoway: false, reversed: false };

                // Check if the new edge overlaps with existing edges
                if (!doesEdgeOverlap(newEdge, room.gameState.edges, room.gameState.nodes)) {
                    room.gameState.edges.push(newEdge); // Add the new edge to the game state
                    room.gameState.money[player.id - 1] -= BRIDGECOST; // Deduct the cost from the player's money

                    // Broadcast the updated game state to all players in the room
                    io.to(roomId).emit('graphData', room.gameState);
                    console.log('Edge built successfully from node ' + from + ' to node ' + to);
                } else {
                    console.log('Edge build request failed due to overlap');
                    socket.emit('errormsg', { message: 'Cannot build over another bridge' });
                }
            } else {
                console.log('Edge build request failed due to ownership or insufficient funds');
                socket.emit('errormsg', { message: 'Node ownership issue or Insufficient funds. Cost: ' + BRIDGECOST });
            }
        }
    });

    socket.on('cannonAttack', ({ roomId, from, to }) => {
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const fromNode = room.gameState.nodes.find(node => node.id === from);
            const toNode = room.gameState.nodes.find(node => node.id === to);
            // Check if the 'from' node is owned by the player, has a cannon, and is large enough
            if (fromNode && toNode && fromNode.owner === player.color && fromNode.cannon && fromNode.size >= MAXNODESIZE && toNode.owner !== player.color) {
                const newEdge = { from: fromNode.id, to: toNode.id, flowing: false, twoway: true, reversed: false };
                if (!doesEdgeOverlap(newEdge, room.gameState.edges, room.gameState.nodes)) {
                    // Perform cannon attack logic here (e.g., reduce health of 'to' node)
                    toNode.owner = player.color;
                    toNode.size = fromNode.size;
                    fromNode.size = 1;
                    console.log(`Cannon attack successful from node ${from} to node ${to}`);
                    io.to(roomId).emit('graphData', room.gameState);
                } else {
                    console.log('Cannon attack failed: path is blocked by existing edges');
                    socket.emit('errormsg', { message: `Cannon can't shoot through bridges`});
                }
            } else {
                console.log('Cannon attack request failed due to node ownership, lack of cannon, node size, or target ownership');
                socket.emit('errormsg', { message: 'Cannon not above max node size or node ownership problem' });
            }
        }
    });

    socket.on('buildTwoWayEdge', ({ roomId, from, to }) => {
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const fromNode = room.gameState.nodes.find(node => node.id === from);
            const toNode = room.gameState.nodes.find(node => node.id === to);

            // Check if the 'from' node is owned by the player and the player has enough money
            if (fromNode && toNode && fromNode.owner === player.color && room.gameState.money[player.id - 1] >= TWOWAY_BRIDGECOST) {
                const newEdge = { from: fromNode.id, to: toNode.id, flowing: false, twoway: true, reversed: false }; //same as other bridge but two way

                // Check if the new edge overlaps with existing edges
                if (!doesEdgeOverlap(newEdge, room.gameState.edges, room.gameState.nodes)) {
                    room.gameState.edges.push(newEdge); // Add the new edge to the game state
                    room.gameState.money[player.id - 1] -= TWOWAY_BRIDGECOST; // Deduct the cost from the player's money
                    io.to(roomId).emit('graphData', room.gameState);
                    console.log('Edge built successfully from node ' + from + ' to node ' + to);
                } else {
                    console.log('Edge build request failed due to overlap');
                    socket.emit('errormsg', { message: 'Cannot build over another bridge' });
                }
            } else {
                console.log('Edge build request failed due to ownership or insufficient funds');
                socket.emit('errormsg', { message: 'Node ownership issue or Insufficient funds. Cost: ' + TWOWAY_BRIDGECOST });
            }
        }
    });


    socket.on('swapDirections', ({ roomId, edgeId }) => {
        console.log('Right-click on edge detected');
        const room = gameRooms[roomId];
        if (room) {
            console.log('In room loop');
            const edge = room.gameState.edges.find(edge => `${edge.from}-${edge.to}` === edgeId);
            if (edge && edge.twoway) { //the two way edge exists
                console.log('Two-way edge exists');
                const fromNode = room.gameState.nodes.find(node => node.id === edge.from);
                const toNode = room.gameState.nodes.find(node => node.id === edge.to);
                const currentPlayer = room.players[socket.id];

                if (fromNode && toNode && currentPlayer) { //if both nodes equal size, then either player can swap
                    if (fromNode.size === toNode.size) {
                        if (fromNode.owner === currentPlayer.color || toNode.owner === currentPlayer.color) {
                            edge.reversed = !edge.reversed;
                            edge.flowing = true;//Turn of flowing if swapped
                            io.to(roomId).emit('graphData', room.gameState);
                        } else {
                            console.log('Player does not own any node of equal size, cannot reverse edge');
                        }
                    } else {
                        const largerNode = fromNode.size > toNode.size ? fromNode : toNode;
                        const smallerNode = fromNode.size > toNode.size ? toNode : fromNode;
                        //determine larger node and if the current player owns the larger node
                        if (largerNode.owner === currentPlayer.color || (largerNode.owner === COLORNEUTRAL && smallerNode.owner === currentPlayer.color)) {
                            edge.reversed = !edge.reversed;
                            edge.flowing = true;//Turn of flowing if swapped
                            io.to(roomId).emit('graphData', room.gameState);
                        } else {
                            console.log('Player does not own the larger node, cannot reverse edge');
                            socket.emit('errormsg', { message: 'Must own the bigger node to reverse the bridge' });
                        }
                    }
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User Disconnected')
        Object.keys(gameRooms).forEach(roomId => {
            const room = gameRooms[roomId];
            if (room.players[socket.id]) {
                console.log('deleting player')
                delete room.players[socket.id]; // Remove the player
                io.to(roomId).emit('errormsg', { message: 'A Player Disconnected (The person who did not get this message is the problem)' });

                // If the game loop is running and players are now less than maxPlayers, stop the game loop
                if (room.gameLoopIntervalId && Object.keys(room.players).length < room.maxPlayers) {
                    clearInterval(room.gameLoopIntervalId);
                    room.gameLoopIntervalId = null; // Reset the interval ID
                    // Optionally, notify remaining players or handle this scenario as needed
                }

                if (Object.keys(room.players).length === 0) {
                    delete gameRooms[roomId]; // Delete the room if no players are left
                }
            }
        });
    });
});

// Serve a simple HTTP response on the root route
app.get('/', (req, res) => {
    res.send('<h1>Hello from the WebSocket server!</h1>');
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
