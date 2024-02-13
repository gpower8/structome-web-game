import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
  //locked: boolean;
}

interface GraphData { //Could probably delete this low key
  nodes: Node[];
  edges: Edge[];
  money: number[]; 
}

function App() {
  const socketRef = useRef<Socket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [], money: [0, 0] });

  useEffect(() => {
    console.log('Socket initialized');
    //if (!socketRef.current) {
    socketRef.current = io('http://localhost:3001');
    //}//makes it sort of global
    const socket = socketRef.current;
    socket.on('connect', () => console.log('Connected to the server.'));
    //could probably remove the ones below this later if we dont need them from debugging
    socket.on('connect_error', (err) => console.error('Connection Error:', err.message));
    socket.on('connect_timeout', (timeout) => console.error('Connection Timeout:', timeout));
    socket.on('error', (error) => console.error('Error:', error));
    socket.on('disconnect', (reason) => console.error('Disconnected:', reason));

    // Listen for graph data updates
    socket.on('graphData', (data: { nodes: Node[]; edges: Edge[]; money: number[] }) => {
      console.log('Graph data received:', data);
      setGraphData(data);
    });

    // Clean up on component unmount
    return () => {
      console.log('Disconnecting socket');
      socket.off('connect');
      socket.off('connect_error');
      socket.off('connect_timeout');
      socket.off('error');
      socket.off('disconnect');
      socket.off('graphData');
      socket.disconnect();
    };
  }, []);
  //Mouse stuff
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('click', handleCanvasClick);

      // Clean up
      return () => {
        canvas.removeEventListener('click', handleCanvasClick);
      };
    }
  }, [graphData]);

  const handleCanvasClick = (event: MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return; // Exit if rect is undefined

    // Ensure we have non-null values for canvas dimensions; you might use fallback values or ensure they are defined
    const canvasWidth = canvasRef.current?.width ?? 0;
    const canvasHeight = canvasRef.current?.height ?? 0;

    // Now that we have ensured canvasWidth and canvasHeight are numbers, TypeScript won't complain
    const scaleX = canvasWidth / rect.width; // Use direct division since we checked rect is defined
    const scaleY = canvasHeight / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // Find if a node was clicked
    const clickedNode = graphData.nodes.find(node => {
      const distance = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
      return distance < 20; // 20 is distance from node that must be clicked
    });

    const clickedEdge = graphData.edges.find(edge => {
      const fromNode = graphData.nodes.find((node) => node.id === edge.from);
      const toNode = graphData.nodes.find((node) => node.id === edge.to);

      if (fromNode && toNode) {
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const distance = Math.abs((dy * x - dx * y + toNode.x * fromNode.y - toNode.y * fromNode.x) / Math.sqrt(dx * dx + dy * dy));

        return distance < 5; //number is distance from edge
      }

      return false;
    });

    if (clickedNode) {
      // Emit an event to the server to update the node owner if socketRef isnt null
      socketRef.current!.emit('updateNodeOwner', { nodeId: clickedNode.id, newOwner: 'blue' });
      console.log('Clicked on node')
    } else if (clickedEdge){
      socketRef.current!.emit('updateEdgeFlowing', { edgeId: clickedEdge.from + "-" + clickedEdge.to, flowing: !clickedEdge.flowing });
      console.log('Clicked on edge')
    }
  };
  

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (canvas && ctx) {
      canvas.width = WIDTH;
      canvas.height = HEIGHT;

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.strokeStyle = 'black';
      ctx.strokeRect(0, 0, WIDTH, HEIGHT);

      // Draw nodes
      graphData.nodes.forEach((node) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.sqrt(node.size + 12), 0, 2 * Math.PI);
        ctx.fillStyle = node.owner;
        ctx.fill();
        ctx.stroke();
        ctx.closePath();
      });

      // Draw edges
      graphData.edges.forEach((edge) => {
        const fromNode = graphData.nodes.find((node) => node.id === edge.from);
        const toNode = graphData.nodes.find((node) => node.id === edge.to);

        if (fromNode && toNode) {
          // Draw the line
          ctx.beginPath();
          ctx.moveTo(fromNode.x, fromNode.y);
          ctx.lineTo(toNode.x, toNode.y);
          ctx.strokeStyle = edge.flowing ? 'blue' : 'black';
          ctx.stroke();

          // Calculate the angle of the line
          const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);

          // Set the length of the arrowhead
          const arrowLength = 10; // Length of the arrowhead lines
          const arrowWidth = 5; // Width of the base of the arrowhead

          // Calculate the points for the arrowhead
          const arrowX = toNode.x - arrowLength * Math.cos(angle);
          const arrowY = toNode.y - arrowLength * Math.sin(angle);

          // Draw the arrowhead as a triangle
          ctx.beginPath();
          ctx.moveTo(arrowX - arrowWidth * Math.sin(angle), arrowY + arrowWidth * Math.cos(angle));
          ctx.lineTo(toNode.x, toNode.y); // Tip of the arrowhead
          ctx.lineTo(arrowX + arrowWidth * Math.sin(angle), arrowY - arrowWidth * Math.cos(angle));
          ctx.fillStyle = edge.flowing ? 'blue' : 'black'; // Fill color of the arrowhead
          ctx.fill();

          ctx.closePath();
        }
      });
    }
  }, [graphData]);

  return (
    <div className="App" style={{ backgroundColor: 'gray' }}>
      {/* Display Money Values */}
      <div className="money-display">
        <p>Player 1 Money: {graphData.money[0]}</p>
        <p>Player 2 Money: {graphData.money[1]}</p>
      </div>
      <canvas ref={canvasRef} className="canvas"></canvas>
    </div>
  );
}

export default App;
