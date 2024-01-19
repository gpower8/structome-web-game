import React, { useEffect, useRef } from 'react';
import './App.css';

const WIDTH = 1600;
const HEIGHT = 900;
const DIAGONAL = Math.floor(Math.sqrt(WIDTH**2 + HEIGHT**2))

interface Node {
  id: number;
  x: number;
  y: number;
}

interface Edge {
  from: number;
  to: number;
}

const generateRandomGraph = (): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Number of nodes
  const numNodes = 50;

  // Minimum distance between nodes
  const minDistance = 100;

  // Base edge probability
  const baseEdgeProbability = 0.5;

  for (let i = 1; i <= numNodes; i++) {
    let newNode: Node;
    do {
      newNode = {
        id: i,
        x: Math.random() * WIDTH, // Adjusted for the specified area width
        y: Math.random() * HEIGHT, // Adjusted for the specified area height
      };
    } while (nodes.some((existingNode) => getDistance(newNode, existingNode) < minDistance));

    nodes.push(newNode);
  }

  const distanceFunction = (distance: number): number => {
    // Adjust this function as needed for your probability distribution
    return Math.pow((DIAGONAL-distance)/DIAGONAL, 12)
  };

  for (let i = 0; i < numNodes; i++) {
    for (let j = i + 1; j < numNodes; j++) {
      const distance = getDistance(nodes[j], nodes[i]);

      const edgeProbability = distanceFunction(distance);
      console.log(i, edgeProbability);
      if (Math.random() < edgeProbability && !doesPathOverlap(nodes[i], nodes[j], edges)) {
        edges.push({ from: nodes[i].id, to: nodes[j].id });
        
      }
    }
  }
  console.log(edges);
  return { nodes, edges };
};

const getDistance = (nodeA: Node, nodeB: Node): number => {
  return Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y);
};

const doesPathOverlap = (fromNode: Node, toNode: Node, existingEdges: Edge[]): boolean => {
  for (const edge of existingEdges) {
    const edgeStart = fromNode.id === edge.from ? fromNode : toNode;
    const edgeEnd = fromNode.id === edge.to ? fromNode : toNode;

    if (doLineSegmentsOverlap(fromNode, toNode, edgeStart, edgeEnd)) {
      return true;
    }
  }

  return false;
};

const doLineSegmentsOverlap = (line1Start: Node, line1End: Node, line2Start: Node, line2End: Node): boolean => {
  return false;
};


function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (canvas && ctx) {
      const areaWidth = WIDTH;
      const areaHeight = HEIGHT;

      // Set canvas size to the specified area dimensions
      canvas.width = areaWidth;
      canvas.height = areaHeight;

      ctxRef.current = ctx;

      // Draw black border
      ctx.strokeStyle = 'black';
      ctx.strokeRect(0, 0, areaWidth, areaHeight);

      const { nodes, edges } = generateRandomGraph();

      // Draw nodes
      nodes.forEach((node) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI); // Adjusted circle size
        ctx.fillStyle = 'blue';
        ctx.fill();
        ctx.stroke();
        ctx.closePath();
      });

      // Draw edges
      edges.forEach((edge) => {
        const fromNode = nodes.find((node) => node.id === edge.from);
        const toNode = nodes.find((node) => node.id === edge.to);

        if (fromNode && toNode) {
          // Draw straight line
          ctx.beginPath();
          ctx.moveTo(fromNode.x, fromNode.y);
          ctx.lineTo(toNode.x, toNode.y);
          ctx.strokeStyle = 'red';
          ctx.stroke();
          ctx.closePath();
        }
      });
    }
  }, []);

  return (
    <div className="App">
      <canvas ref={canvasRef} className="canvas"></canvas>
    </div>
  );
}

export default App;
