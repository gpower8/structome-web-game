import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';

const WIDTH = 1600;
const HEIGHT = 900;

//sound effect
const blopSound = new Audio('/blop.mp3');

var texture = new Image();
texture.src = 'texture.png';

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

  new Audio('/soundtrack.mp3').play();

  useEffect(() => {
    socketRef.current = io('/');
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

  //nuke and bastion
  const [isBastionMode, setIsBastionMode] = useState(false);
  const [isNukeMode, setIsNukeMode] = useState(false);

  useEffect(() => { //Main drawing canvas useEffect
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      canvas.width = WIDTH;
      canvas.height = HEIGHT;

      // Clear the canvas
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // Set the background color
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // 50% transparent white
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Draw nodes
      graphData.nodes.forEach(node => {
        // Set globalAlpha to 0.5 to make everything drawn half transparent
        ctx.globalAlpha = 0.5;

        // Draw the texture scaled to the node size behind the node
        // Adjust the x, y, width, and height values to position and scale the texture as needed
        var textureSize = Math.sqrt(node.size/1.6 + 70);
        ctx.drawImage(texture, node.x - textureSize*1.15, node.y - textureSize*1.15, textureSize * 2.3, textureSize * 2.3);

        // Draw the node
        ctx.beginPath();
        ctx.arc(node.x, node.y, textureSize, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.owner;
        ctx.fill();
        ctx.lineWidth = node.size >= 800 ? 8 : 1; //Big stroke if size is maxed
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        if (node.moneynode) {
          ctx.lineWidth = 7;
          ctx.strokeStyle = 'orange';
          ctx.stroke();
        }
        ctx.lineWidth = 1;// Reset lineWidth back to 1

        // Reset globalAlpha back to 1 to stop affecting other drawings with the transparency
        ctx.globalAlpha = 1.0;
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
            ctx.fillStyle = edge.flowing ? fromNode.owner : 'LightGray'; // Use the 'fromNode' color
            ctx.fill();

            if (edge.twoway) {
              ctx.lineWidth = 2; // Set the stroke thickness to 5 pixels (or any other desired thickness)
              ctx.strokeStyle = 'orange';
              ctx.stroke(); // Apply the thicker stroke to the path (triangle in this context)
              ctx.lineWidth = 1; // Reset lineWidth back to 1 (or your default value) to avoid affecting other drawings
            }
            if (firstNode && cursorPosition && isBridgeBuildMode) {
              // Draw a line from firstNode to cursorPosition
              ctx.beginPath();
              ctx.moveTo(firstNode.x, firstNode.y);
              ctx.lineTo(cursorPosition.x, cursorPosition.y);
              ctx.strokeStyle = 'white'; // Set line color
              ctx.lineWidth = 3; // Set line width
              ctx.stroke();
            }
          }
        }
      });
    }
  }, [graphData, firstNode, cursorPosition, isBridgeBuildMode, isNukeMode, isBastionMode]);

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
        const dot = (((x - fromNode.x) * dx) + ((y - fromNode.y) * dy)) / (length * length);

        // Ensure dot is within the range of [0, 1] to be on the line segment
        if (dot < 0 || dot > 1) return false;

        const closestX = fromNode.x + (dot * dx);
        const closestY = fromNode.y + (dot * dy);
        const distance = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);

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


  useEffect(() => { // Activate Modes
    const handleKeyPress = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'a':
          console.log('Bridge Build Mode Toggled');
          setIsBridgeBuildMode(current => !current);
          setFirstNode(null); // Reset first node selection
          if (!isBridgeBuildMode) {
            setIsBastionMode(false);
            setIsNukeMode(false);
          }
          break;
        case 's':
          console.log('Bastion Mode Toggled');
          setIsBastionMode(current => !current);
          if (!isBastionMode) {
            setIsBridgeBuildMode(false);
            setIsNukeMode(false);
          }
          break;
        case 'd':
          console.log('Nuke Mode Toggled');
          setIsNukeMode(current => !current);
          if (!isNukeMode) {
            setIsBridgeBuildMode(false);
            setIsBastionMode(false);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [isBridgeBuildMode, isBastionMode, isNukeMode]);

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
        blopSound.play();
        if(isBridgeBuildMode){
          console.log('node clicked in bridge mode');
          if (!firstNode) {
            setFirstNode(clickedNode); // Set first node if not already set
          } else {
            // Emit edge build request to server with firstNode and clickedNode
            socketRef.current?.emit('buildEdge', { roomId, from: firstNode.id, to: clickedNode.id });
            setIsBridgeBuildMode(false); // Exit bridge build mode
            setFirstNode(null); // Reset first node selection
            console.log('processing click'+isBridgeBuildMode);
          }
        } else if (isBastionMode) {
          console.log('Node Clicked with Bastion')
          socketRef.current?.emit('bastion', { roomId, nodeId: clickedNode.id });
          setIsBastionMode(false);
          return;
        } else if (isNukeMode) {
          console.log('Node Clicked with Nuke')
          socketRef.current?.emit('nuke', { roomId, nodeId: clickedNode.id });
          setIsNukeMode(false);
          return;
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
  }, [graphData, roomId, isBridgeBuildMode, isNukeMode, isBastionMode]); // Re-run when graphData or roomId changes

  return (
    <div className="App" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      height: '100vh', // Ensure the div takes full viewport height
      backgroundImage: roomId ? `url('/structomebg.png')` : `url('/menuscreen.gif')`, // Set the background image conditionally based on roomId      backgroundSize: 'cover', // Cover the entire div with the background image
      backgroundPosition: 'center', // Center the background image
      backgroundSize: 'cover', // Stretch the image to cover the entire div
      backgroundRepeat: 'no-repeat', // Do not repeat the background image
    }}>
      {!roomId && (
        <div className="menu">
          <img src="/menutext.gif" alt="Logo" className="menu-logo" />
          <select className="menu-select" value={numPlayers} onChange={(e) => setNumPlayers(Number(e.target.value))}>
            {[2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value} Players
              </option>
            ))}
          </select>
          <button className="menu-button" onClick={() => createRoom(numPlayers)}>Create Room</button>
          <input
            className="menu-input"
            type="text"
            placeholder="Room ID"
            onKeyPress={(e) => {
              const target = e.target as HTMLInputElement;
              if (e.key === 'Enter') {
                joinRoom(target.value);
              }
            }}
          />
          <button className="menu-button" onClick={() => {
            const inputElement = document.querySelector('.menu-input') as HTMLInputElement;
            if (inputElement && inputElement.value) {
              joinRoom(inputElement.value);
            }
          }}>Join Room</button>
        </div>
      )}
      {roomId && (
        <div className="game-container">
          <div className="game-info">
            {player && (
              <div className="player-money">
                <p>Player {player.id} - Money: <span className="money-amount">${graphData.money[player.id - 1]}</span></p>
              </div>
            )}
            <div className="icons-container">
              <img src="/bridge.png" alt="Icon 1" className={`game-icon ${isBridgeBuildMode ? 'active-icon' : ''}`} />
              <img src="/bastion.png" alt="Icon 2" className={`game-icon ${isBastionMode ? 'active-icon' : ''}`} />
              <img src="/bomb.png" alt="Icon 3" className={`game-icon ${isNukeMode ? 'active-icon' : ''}`} />
            </div>
            <button className="room-id-button" onClick={() => navigator.clipboard.writeText(roomId)}>
              Room ID: {roomId}
            </button>
          </div>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="canvas" />
        </div>
      )}
    </div>
  );
}

export default App;