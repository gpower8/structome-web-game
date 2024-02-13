// Import required modules
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

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
        origin: "http://localhost:3000", // this should match your client's host and port
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});

// Set the port for the server to listen on
const PORT = process.env.PORT || 3001;

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
    const nodes = [];
    const edges = [];
    const numNodes = 50;
    const minDistance = 100;
    const money = [5, 5];//both players start with 5 points

    // Generate nodes with random positions ensuring minimum distance between them
    for (let i = 1; i <= numNodes; i++) {
        let newNode;
        do {
            newNode = {
                id: i,
                x: Math.random() * WIDTH,
                y: Math.random() * HEIGHT,
                size: 1,
                owner: 'gray', // Initial owner set to 'gray'
            };
        } while (nodes.some((existingNode) => getDistance(newNode, existingNode) < minDistance));

        nodes.push(newNode);
    }

    // Function to determine edge creation probability based on distance
    const distanceFunction = (distance) => {
        return Math.pow((DIAGONAL - distance) / DIAGONAL, 12);
    };

    // Generate edges based on distance function and probability
    for (let i = 0; i < numNodes; i++) {
        for (let j = i + 1; j < numNodes; j++) {
            const distance = getDistance(nodes[i], nodes[j]);
            const edgeProbability = distanceFunction(distance);

            if (Math.random() < edgeProbability && !doesPathOverlap(nodes[i], nodes[j], edges, nodes)) {
                edges.push({ from: nodes[i].id, to: nodes[j].id, flowing:false });
            }
        }
    }

    return { nodes, edges, money };
}

const storedGraphData = generateRandomGraph();
const TICK_RATE = 1000 / 1 // 1 times per second

// Function to update the game state
function updateGameState() {
    
    if (storedGraphData && storedGraphData.nodes && storedGraphData.edges && storedGraphData.money) {
        //Grow nodes
        storedGraphData.nodes.forEach(node => {
            // Check if the node owner is not 'gray' and size is less than 30
            if (node.owner !== 'gray' && node.size < 30) {
                node.size++;
            }
        });
        storedGraphData.money = storedGraphData.money.map(m => m + 1);

        storedGraphData.edges.forEach(edge => {
            // Check if the edge is flowing
            if (edge.flowing) {
                // Find the 'from' and 'to' nodes in the nodes array
                const fromNode = storedGraphData.nodes.find(node => node.id === edge.from);
                const toNode = storedGraphData.nodes.find(node => node.id === edge.to);

                // Check if the 'from' node has a size of 2 or more
                if (fromNode.size >= 2) {
                    // Transfer 1 size from the 'from' node to the 'to' node
                    fromNode.size -= 1;
                    toNode.size += 1;
                }
            }
        });

        // Emit the updated game state to all connected clients
        io.emit('graphData', storedGraphData); // io.emit sends it to all clients
        console.log('Emitting graphData', storedGraphData);
    } else {
        // Log for debugging purposes
        console.log('storedGraphData is not complete, skipping emit');
    }
}

// Start the game loop
const gameLoopInterval = setInterval(updateGameState, TICK_RATE);


// Handle WebSocket connections
io.on('connection', (socket) => {
    console.log('A user connected');
    //can delete this function, its just for debugging
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
    // Clear the interval on disconnection to prevent memory leaks
    socket.on('disconnect', () => {
        console.log('User disconnected');
        clearInterval(gameLoopInterval);
    });

    socket.on('updateNodeOwner', ({ nodeId, newOwner }) => {
        console.log('Node clicked on');
        const node = storedGraphData.nodes.find(node => node.id === nodeId);
        if (node && storedGraphData.money[0] >= 5) {
            node.owner = newOwner;
            // Subtract 5 points from player 1's money if he has 5 or more
            storedGraphData.money[0] -= 5;
            io.emit('graphData', storedGraphData);
        }
    });
    socket.on('updateEdgeFlowing', ({ edgeId, flowing }) => {
        console.log('Edge clicked on');
        const edgeIndex = storedGraphData.edges.findIndex(edge => `${edge.from}-${edge.to}` === edgeId);
        if (edgeIndex !== -1) {
            storedGraphData.edges[edgeIndex].flowing = flowing;
            io.emit('graphData', storedGraphData);
        }
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
