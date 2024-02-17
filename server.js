const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});

const PORT = process.env.PORT || 3001;

const playerProperties = {
    ids: [1, 2, 3, 4, 5],
    colors: ["blue", "red", "green", "yellow", "purple"] // Add more colors for additional players
};

const gameRooms = {};

function generateRandomGraph() {
    const nodes = [], edges = [];
    const numNodes = 50, minDistance = 100, money = [0, 0, 0, 0, 0];

    for (let i = 0; i < numNodes; i++) {
        let newNode;
        do {
            newNode = {
                id: i,
                x: Math.random() * 1600,
                y: Math.random() * 900,
                size: 1,
                owner: 'gray',
            };
        } while (nodes.some(node => getDistance(newNode, node) < minDistance));
        nodes.push(newNode);
    }

    for (let i = 0; i < numNodes; i++) {
        for (let j = i + 1; j < numNodes; j++) {
            if (Math.random() < calculateEdgeProbability(nodes[i], nodes[j])) {
                edges.push({ from: nodes[i].id, to: nodes[j].id, flowing: false });
            }
        }
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

function updateGameState(roomId) {
    const room = gameRooms[roomId];
    if (room && room.gameState) {
        const { gameState } = room;

        // Grow nodes
        gameState.nodes.forEach(node => {
            if (node.owner !== 'gray' && node.size < 100) {
                node.size++;
            }
        });
        // Increment money for each player
        gameState.money = gameState.money.map(m => m + 1);
        // Update edges
        gameState.edges.forEach(edge => {
            if (edge.flowing) {
                const fromNode = gameState.nodes.find(node => node.id === edge.from);
                const toNode = gameState.nodes.find(node => node.id === edge.to);

                if (fromNode && toNode && fromNode.size >= 5) { //atleast size 5 to attack
                    if (fromNode.owner === toNode.owner) { //If same color nodes, transfer, otherwise fight
                        if (toNode.size<100){
                            fromNode.size -= 1;
                            toNode.size += 1;
                        }
                    } else {
                        fromNode.size -= 1;
                        toNode.size -= 1;

                        if (toNode.size <= 0) {
                            toNode.owner = fromNode.owner; //Switch color of node
                            toNode.size = 1; 
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
        const roomId = crypto.randomBytes(4).toString('hex');

        if (numPlayers > playerProperties.ids.length) {
            socket.emit('error', 'Maximum number of players exceeded');
            return;
        }

        gameRooms[roomId] = {
            gameState: generateRandomGraph(),
            players: {}, // Initialize as empty; players will be added as they join
            maxPlayers: numPlayers // Store the maximum number of players allowed
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
                    room.gameLoopIntervalId = setInterval(() => updateGameState(roomId), 1000);
                }
            } else {
                socket.emit('roomFull', roomId);
            }
        } else {
            socket.emit('roomNotFound', roomId);
        }
    });

    socket.on('updateNodeOwner', ({ roomId, nodeId }) => {
        console.log('NodeClickedOn');
        const room = gameRooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            const node = room.gameState.nodes.find(node => node.id === nodeId);
            if (node && node.owner === 'gray' && room.gameState.money[player.id-1] >= 5) {
                node.owner = player.color;
                room.gameState.money[player.id-1] -= 5;
                io.to(roomId).emit('graphData', room.gameState);
            }
        }
    });

    socket.on('updateEdgeFlowing', ({ roomId, edgeId, flowing }) => {
        const room = gameRooms[roomId];
        if (room) {
            const edge = room.gameState.edges.find(edge => `${edge.from}-${edge.to}` === edgeId);
            if (edge) {
                const fromNode = room.gameState.nodes.find(node => node.id === edge.from);
                const currentPlayer = room.players[socket.id];
                if (fromNode && currentPlayer && fromNode.owner === currentPlayer.color) {
                    edge.flowing = flowing;
                    io.to(roomId).emit('graphData', room.gameState);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        Object.keys(gameRooms).forEach(roomId => {
            const room = gameRooms[roomId];
            if (room.players[socket.id]) {
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