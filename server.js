const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto'); // For generating unique room IDs

// Initialize express app and HTTP server
const app = express();
const server = http.createServer(app);

// Graph dimensions constants
const WIDTH = 1600;
const HEIGHT = 900;
const DIAGONAL = Math.sqrt(WIDTH ** 2 + HEIGHT ** 2);

// Initialize socket.io with the HTTP server
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});

// Set the port for the server to listen on
const PORT = process.env.PORT || 3001;

// Game state storage
const gameRooms = {};

// Function to calculate the distance between two nodes
function getDistance(nodeA, nodeB) {
    return Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y);
}

// Placeholder function for checking if paths overlap
function doesPathOverlap(fromNode, toNode, existingEdges, nodes) {
    return false;
}

// Function to generate a random graph
function generateRandomGraph() {
    console.log('Generating map');
    const nodes = [];
    const edges = [];
    const numNodes = 50;
    const minDistance = 100;
    const money = [5, 5]; // Both players start with 5 points

    for (let i = 1; i <= numNodes; i++) {
        let newNode;
        do {
            newNode = {
                id: i,
                x: Math.random() * WIDTH,
                y: Math.random() * HEIGHT,
                size: 1,
                owner: 'gray',
            };
        } while (nodes.some((existingNode) => getDistance(newNode, existingNode) < minDistance));

        nodes.push(newNode);
    }

    const distanceFunction = (distance) => {
        return Math.pow((DIAGONAL - distance) / DIAGONAL, 12);
    };

    for (let i = 0; i < numNodes; i++) {
        for (let j = i + 1; j < numNodes; j++) {
            const distance = getDistance(nodes[i], nodes[j]);
            const edgeProbability = distanceFunction(distance);

            if (Math.random() < edgeProbability && !doesPathOverlap(nodes[i], nodes[j], edges, nodes)) {
                edges.push({ from: nodes[i].id, to: nodes[j].id, flowing: false });
            }
        }
    }

    return { nodes, edges, money };
}

const TICK_RATE = 1000 / 1; // Update game state 1 time per second

// Function to update the game state for a specific room
function updateGameState(roomId) {
    const gameState = gameRooms[roomId];
    if (gameState && gameState.nodes && gameState.edges && gameState.money) {
        // Grow nodes
        gameState.nodes.forEach(node => {
            if (node.owner !== 'gray' && node.size < 30) {
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
                if (fromNode.size >= 2) {
                    fromNode.size -= 1;
                    toNode.size += 1;
                }
            }
        });

        // Emit the updated game state to all clients in the room
        io.to(roomId).emit('graphData', gameState);
        console.log(gameState);
    }
}

// Start the game loop for each room
function startGameLoopForRoom(roomId) {
    return setInterval(() => updateGameState(roomId), TICK_RATE);
}

// Handle WebSocket connections
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('createRoom', () => {
        const roomId = crypto.randomBytes(4).toString('hex'); // Generate a unique room ID
        gameRooms[roomId] = generateRandomGraph(); // Initialize game state for the new room
        socket.join(roomId); // Add the creating user to the new room
        socket.emit('roomCreated', roomId); // Notify the user of their new room ID
        startGameLoopForRoom(roomId);
        console.log(`Room ${roomId} created and game loop started`);
    });

    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        const gameState = gameRooms[roomId];
        if (gameState) {
            socket.emit('graphData', gameState);
        }
        console.log('Room joined');
    });

    socket.on('updateNodeOwner', ({ roomId, nodeId, newOwner }) => {
        const gameState = gameRooms[roomId];
        if (gameState) {
            const node = gameState.nodes.find(node => node.id === nodeId);
            if (node && gameState.money[0] >= 5) {
                node.owner = newOwner;
                gameState.money[0] -= 5;
                io.to(roomId).emit('graphData', gameState);
            }
        }
    });

    socket.on('updateEdgeFlowing', ({ roomId, edgeId, flowing }) => {
        const gameState = gameRooms[roomId];
        if (gameState) {
            const edgeIndex = gameState.edges.findIndex(edge => `${edge.from}-${edge.to}` === edgeId);
            if (edgeIndex !== -1) {
                gameState.edges[edgeIndex].flowing = flowing;
                io.to(roomId).emit('graphData', gameState);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
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