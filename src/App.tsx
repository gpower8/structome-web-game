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
  moneynode: boolean;
}

interface Edge {
  from: number;
  to: number;
  flowing: boolean;
  twoway: boolean;
  reversed: boolean;
}

interface GraphData {
  nodes: Node[];
  edges: Edge[];
  money: number[];
}

interface Player {
  id: number;
  color: string;
}

function App() {
  const socketRef = useRef<Socket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [], money: [0, 0] });
  const [roomId, setRoomId] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [numPlayers, setNumPlayers] = useState<number>(2); // Default to 2 players

  useEffect(() => {
    socketRef.current = io('http://localhost:3001');
    const socket = socketRef.current;

    socket.on('connect', () => console.log('Connected to the server.'));
    socket.on('roomCreated', ({ roomId, playerInfo }: { roomId: string; playerInfo: Player }) => {
      console.log('Room created with ID:', roomId);
      setRoomId(roomId);
      setPlayer(playerInfo);
    });
    socket.on('playerInfo', (playerInfo: Player) => {
      setPlayer(playerInfo); // Set player state with the received info
    });
    socket.on('graphData', (data: GraphData) => {
      setGraphData(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = (numPlayers: number) => {
    socketRef.current?.emit('createRoom', numPlayers);
  };

  const joinRoom = (id: string) => {
    socketRef.current?.emit('joinRoom', id);
    setRoomId(id);
  };
  //bridge build mode
  const [isBridgeBuildMode, setIsBridgeBuildMode] = useState(false);
  const [firstNode, setFirstNode] = useState<Node | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => { //Main drawing useEffect
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
        ctx.arc(node.x, node.y, Math.sqrt(node.size*2)+5, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.owner;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#003300';
        ctx.stroke();
      });

      // Draw edges
      graphData.edges.forEach(edge => {
        const fromNode = edge.reversed
          ? graphData.nodes.find(node => node.id === edge.to)   // If 'edge.reversed' is true then assign backwards
          : graphData.nodes.find(node => node.id === edge.from);
        const toNode = edge.reversed
          ? graphData.nodes.find(node => node.id === edge.from)
          : graphData.nodes.find(node => node.id === edge.to);
        if (fromNode && toNode) {
          const dx = toNode.x - fromNode.x;
          const dy = toNode.y - fromNode.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          // Add Math.PI to reverse the direction of the triangles
          const angle = Math.atan2(dy, dx) + Math.PI; // Reverse direction

          const triangleSize = 10; // Set the size of the triangles
          const spacing = 20; // Set the spacing between the triangles

          // Calculate how many triangles can fit along the line
          const triangleCount = Math.floor(distance / spacing);

          for (let i = 0; i < triangleCount; i++) {
            const segmentFraction = (i + 1) / (triangleCount + 1);
            const triangleCenterX = fromNode.x + segmentFraction * dx;
            const triangleCenterY = fromNode.y + segmentFraction * dy;

            ctx.beginPath();
            // Adjust the points to draw the triangle in the reversed direction
            ctx.moveTo(
              triangleCenterX + triangleSize * Math.cos(angle - Math.PI / 8),
              triangleCenterY + triangleSize * Math.sin(angle - Math.PI / 8)
            );
            ctx.lineTo(
              triangleCenterX + triangleSize * Math.cos(angle + Math.PI / 8),
              triangleCenterY + triangleSize * Math.sin(angle + Math.PI / 8)
            );
            ctx.lineTo(
              triangleCenterX + triangleSize * Math.cos(angle + Math.PI), // This now points towards the original 'fromNode'
              triangleCenterY + triangleSize * Math.sin(angle + Math.PI)
            );
            ctx.closePath();
            ctx.fillStyle = edge.flowing ? fromNode.owner : 'gray'; // Use the 'fromNode' color
            ctx.fill();

            if (edge.twoway) {
              ctx.lineWidth = 2; // Set the stroke thickness to 5 pixels (or any other desired thickness)
              ctx.strokeStyle = 'black';
              ctx.stroke(); // Apply the thicker stroke to the path (triangle in this context)
              ctx.lineWidth = 1; // Reset lineWidth back to 1 (or your default value) to avoid affecting other drawings
            }
            if (firstNode && cursorPosition && isBridgeBuildMode) {
              // Draw a line from firstNode to cursorPosition
              ctx.beginPath();
              ctx.moveTo(firstNode.x, firstNode.y);
              ctx.lineTo(cursorPosition.x, cursorPosition.y);
              ctx.strokeStyle = '#000'; // Set line color
              ctx.lineWidth = 2; // Set line width
              ctx.stroke();
            }
          }
        }
      });
    }
  }, [graphData, firstNode, cursorPosition, isBridgeBuildMode]);

  useEffect(() => { //Right click
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleCanvasRightClick = (event: MouseEvent) => {
      event.preventDefault(); // Prevent the default context menu

      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (canvas.height / rect.height);

      // Check if an edge was right-clicked
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
        console.log('Edge Right-Clicked');
        // Emit a custom event for the right-clicked edge
        socketRef.current?.emit('swapDirections', { roomId, edgeId: `${clickedEdge.from}-${clickedEdge.to}` });
      }
    };

    canvas.addEventListener('contextmenu', handleCanvasRightClick);

    return () => {
      canvas.removeEventListener('contextmenu', handleCanvasRightClick);
    };
  }, [graphData, roomId]); // Re-run when graphData or roomId changes


  useEffect(() => { //Activate Bridge Mode
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'a') {
        console.log('pressed a');
        setIsBridgeBuildMode(!isBridgeBuildMode); // Toggle bridge build mode
        setFirstNode(null); // Reset first node selection
        console.log('pressed'+isBridgeBuildMode);
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [isBridgeBuildMode]);

  useEffect(() => { //Cursor Track Helper
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!isBridgeBuildMode || !firstNode) return; // Only track cursor in bridge build mode and after selecting the first node

      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (canvas.height / rect.height);
      setCursorPosition({ x, y });
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isBridgeBuildMode, firstNode]);

  useEffect(() => { //left click
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
        console.log('node clicked'+isBridgeBuildMode);
        if(isBridgeBuildMode){
          if (!firstNode) {
            setFirstNode(clickedNode); // Set first node if not already set
          } else {
            // Emit edge build request to server with firstNode and clickedNode
            socketRef.current?.emit('buildEdge', { roomId, from: firstNode.id, to: clickedNode.id });
            setIsBridgeBuildMode(false); // Exit bridge build mode
            setFirstNode(null); // Reset first node selection
            console.log('processing click'+isBridgeBuildMode);
          }
        } else {
          // Emit event to update node owner
          console.log('Node Clicked');
          socketRef.current?.emit('updateNodeOwner', { roomId, nodeId: clickedNode.id }); // Change 'blue' to the current player's color
          return;
        }
      } else {
        // Check if an edge was clicked (optional, based on your game logic)
        const clickedEdge = graphData.edges.find(edge => {
          const fromNode = graphData.nodes.find(node => node.id === edge.from);
          const toNode = graphData.nodes.find(node => node.id === edge.to);
          if (!fromNode || !toNode) return false;

          const dx = toNode.x - fromNode.x;
          const dy = toNode.y - fromNode.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const dot = (((x - fromNode.x) * dx) + ((y - fromNode.y) * dy)) / (length * length);

          // Ensure dot is within the range of [0, 1] to be on the line segment
          if (dot < 0 || dot > 1) return false;

          const closestX = fromNode.x + (dot * dx);
          const closestY = fromNode.y + (dot * dy);
          const distance = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);

          return distance < 10; // Assuming a clickable range of 10 pixels around the edge
        });

        if (clickedEdge) {
          console.log('Edge Clicked');
          socketRef.current?.emit('updateEdgeFlowing', { roomId, edgeId: `${clickedEdge.from}-${clickedEdge.to}`, flowing: !clickedEdge.flowing });
        }
      };
      }
    canvas.addEventListener('click', handleCanvasClick);

    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [graphData, roomId, isBridgeBuildMode]); // Re-run when graphData or roomId changes

  return (
    <div className="App" style={{ backgroundColor: 'gray', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {!roomId && (
        <div>
          <select value={numPlayers} onChange={(e) => setNumPlayers(Number(e.target.value))}>
            {[2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value} Players
              </option>
            ))}
          </select>
          <button onClick={() => createRoom(numPlayers)}>Create Room</button>
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
          {/* Display only the current player's money */}
          <div className="money-display">
            {player && (
              <p>Player {player.id}'s Money: {graphData.money[player.id - 1]}</p>
            )}
          </div>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="canvas" />
        </div>
      )}
    </div>
  );
}

export default App;