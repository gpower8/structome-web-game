import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';

const WIDTH = 1600;
const HEIGHT = 900;

interface Node {
  id: number;
  x: number;
  y: number;
  size: number;
  owner: string;
}

interface Edge {
  from: number;
  to: number;
  flowing: boolean;
}

interface GraphData {
  nodes: Node[];
  edges: Edge[];
  money: number[];
}

function App() {
  const socketRef = useRef<Socket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [], money: [0, 0] });
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    socketRef.current = io('http://localhost:3001');
    const socket = socketRef.current;

    socket.on('connect', () => console.log('Connected to the server.'));
    socket.on('roomCreated', (id: string) => {
      console.log('Room created with ID:', id);
      setRoomId(id);
    });
    socket.on('graphData', (data: GraphData) => {
      setGraphData(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = () => {
    socketRef.current?.emit('createRoom');
  };

  const joinRoom = (id: string) => {
    socketRef.current?.emit('joinRoom', id);
    setRoomId(id);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      canvas.width = WIDTH;
      canvas.height = HEIGHT;

      // Clear the canvas
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // Set the background color
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Draw nodes
      graphData.nodes.forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 20, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.owner;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#003300';
        ctx.stroke();
      });

      // Draw edges
      graphData.edges.forEach(edge => {
        const fromNode = graphData.nodes.find(node => node.id === edge.from);
        const toNode = graphData.nodes.find(node => node.id === edge.to);
        if (fromNode && toNode) {
          ctx.beginPath();
          ctx.moveTo(fromNode.x, fromNode.y);
          ctx.lineTo(toNode.x, toNode.y);
          ctx.strokeStyle = edge.flowing ? 'red' : 'black';
          ctx.stroke();
        }
      });
    }
  }, [graphData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleCanvasClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (canvas.height / rect.height);

      // Check if a node was clicked
      const clickedNode = graphData.nodes.find(node => {
        const distance = Math.sqrt(Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2));
        return distance < 20; // Assuming the node radius is 20
      });

      if (clickedNode) {
        // Emit event to update node owner
        console.log('Node Clicked');
        socketRef.current?.emit('updateNodeOwner', { roomId, nodeId: clickedNode.id, newOwner: 'blue' }); // Change 'blue' to the current player's color
        return;
      }

      // Check if an edge was clicked (optional, based on your game logic)
      const clickedEdge = graphData.edges.find(edge => {
        const fromNode = graphData.nodes.find(node => node.id === edge.from);
        const toNode = graphData.nodes.find(node => node.id === edge.to);
        if (!fromNode || !toNode) return false;

        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const dot = (((x - fromNode.x) * dx) + ((y - fromNode.y) * dy)) / Math.pow(length, 2);

        const closestX = fromNode.x + (dot * dx);
        const closestY = fromNode.y + (dot * dy);
        const distance = Math.sqrt(Math.pow(x - closestX, 2) + Math.pow(y - closestY, 2));

        return distance < 10; // Assuming a clickable range of 10 pixels around the edge
      });

      if (clickedEdge) {
        // Emit event to update edge state (e.g., flowing)
        console.log('Edge Clicked');
        socketRef.current?.emit('updateEdgeFlowing', { roomId, edgeId: `${clickedEdge.from}-${clickedEdge.to}`, flowing: !clickedEdge.flowing });
      }
    };

    canvas.addEventListener('click', handleCanvasClick);

    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [graphData, roomId]); // Re-run when graphData or roomId changes

  return (
    <div className="App" style={{ backgroundColor: 'gray', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {!roomId && (
        <div>
          <button onClick={createRoom}>Create Room</button>
          <input
            type="text"
            placeholder="Room ID"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                joinRoom((e.target as HTMLInputElement).value);
              }
            }}
          />
        </div>
      )}
      {roomId && (
        <div>
          <p>Room ID: {roomId}</p>
          {/* Display Money Values */}
          <div className="money-display">
            <p>Player 1 Money: {graphData.money[0]}</p>
            <p>Player 2 Money: {graphData.money[1]}</p>
          </div>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="canvas" />
        </div>
      )}
    </div>
  );
}

export default App;