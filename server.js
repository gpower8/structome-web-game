const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "https://structome-mfbi2.ondigitalocean.app/", //app domain
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
const BASTIONCOST = 15;
const BRIDGECOST = 15;
const NUKECOST = 30;
const NODECOST = 5;

const INCOMERATE = 1;
const MONEYNODEBONUS = 1;
const MAXNODESIZE = 800;
const TRANSFER = 0.01;
const GROWTHRATE = 1;
const COLORNEUTRAL = 'white';

function generateRandomGraph() {
    const nodes = [], edges = [];
    const numNodes = 50, minDistance = 90, money = [5, 5, 5, 5, 5];
    
    const centerX = 1560 / 2 + 20; //finds middle of the screen
    const centerY = 860 / 2 + 20;
    
    for (let i = 0; i < numNodes; i++) {
        let newNode;
        do {
            newNode = {
                id: i,
                x: (Math.random() * 1560)+20, //changed math so node isnt on edge of screen
                y: (Math.random() * 860)+20,
                size: 1,
                owner: COLORNEUTRAL,
                moneynode: false
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
        closestNode.size = 800;
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
        gameState.nodes.forEach(node => {
            if (node.owner !== COLORNEUTRAL && node.owner !== 'black' && node.size < MAXNODESIZE) {
                node.size=node.size+GROWTHRATE;
            }
        });
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
        gameState.edges.forEach(edge => {
            if (edge.flowing) {
                const fromNode = edge.reversed
                    ? room.gameState.nodes.find(node => node.id === edge.to) //opposite if reversed
                    : room.gameState.nodes.find(node => node.id === edge.from);
                const toNode = edge.reversed
                    ? room.gameState.nodes.find(node => node.id === edge.from)
                    : room.gameState.nodes.find(node => node.id === edge.to);
                if (fromNode && toNode && fromNode.size >= 30) { // Ensure at least size 30 to attack or transfer
                    const transferAmount = Math.ceil(fromNode.size * TRANSFER); // Calculate 1% of the 'from' node's size, rounded up
                    if (fromNode.owner === toNode.owner) { // If same color nodes, transfer, otherwise fight
                        if (toNode.size < MAXNODESIZE) {
                            fromNode.size -= transferAmount; // Subtract the transfer amount from the 'from' node
                            toNode.size += transferAmount; // Add the transfer amount to the 'to' node
                        }
                    } else {
                        fromNode.size -= transferAmount; // Subtract the transfer amount for the attack
                        toNode.size -= transferAmount*2; // (Double damage mode) The 'to' node also loses the transfer amount in the fight

                        if (toNode.size <= 0) {
                            toNode.owner = fromNode.owner; // Switch the color of the node if 'to' node's size drops to 0 or below
                            toNode.size = Math.max(1, transferAmount+toNode.size); // Ensure the 'to' node has at least size 1 or the transfer amount after the color switch
                        }
                    }
                }
            }
        });

        // Broadcast the updated game state to all clients in the room
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
            players: {}, // Initialize as empty; players will be added as they join
            maxPlayers: numPlayers, // Store the maximum number of players allowed
            tickCount: 0//
        };

        // Add the room creator as the first player
        gameRooms[roomId].players[socket.id] = {
            id: playerProperties.ids[0],
            color: playerProperties.colors[0]
        };

        socket.join(roomId);
        // Emit room creation confirmation along with player info
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

                // Check if the room is now full
                if (playerCount + 1 === room.maxPlayers) {
                    // Start the game loop only when the room is full
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
                room.gameState.money[player.id - 1] -= NODECOST;
                io.to(roomId).emit('graphData', room.gameState);
            }
        }
    });

    socket.on('bastion', ({ roomId, nodeId }) => {
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const node = room.gameState.nodes.find(node => node.id === nodeId);

            if (node && node.owner === player.color && room.gameState.money[player.id - 1] >= BASTIONCOST) {
                node.owner = 'black'; // Change the node's color to not neutral so it cant be clicked
                node.size = 3*node.size+50; // Triple the node's size
                room.gameState.money[player.id - 1] -= BASTIONCOST; // Subtract 5 money from the player
                io.to(roomId).emit('graphData', room.gameState);
                console.log('Bastion successfully activated on node ' + nodeId);
            } else {
                console.log('Bastion activation failed: Node not owned by player or insufficient funds');
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
                }
            } else {
                console.log('Nuke activation failed: Node owned by player or does not exist');
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
                }
            } else {
                console.log('Edge build request failed due to ownership or insufficient funds');
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
                        //determine larger node and if the current player owns the larger node
                        if (largerNode.owner === currentPlayer.color) {
                            edge.reversed = !edge.reversed;
                            edge.flowing = true;//Turn of flowing if swapped
                            io.to(roomId).emit('graphData', room.gameState);
                        } else {
                            console.log('Player does not own the larger node, cannot reverse edge');
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