Structome change from Server to Local

Server Mode:

Server.js:

origin: process.env.CORS_ORIGIN || "https://structome-mfbi2.ondigitalocean.app/",
const PORT = process.env.PORT || 8080;

App.tsx:socketRef.current = io('/');


(Added this for some reason?:app.use(express.static('/workspace/client/build'));

// Catch-all handler for any request that doesn't match one above, send back the index.html file
app.get('*', (req, res) => {
    res.sendFile('/workspace/client/build/index.html');
});
)

Script:"start": "node server.js”


Local Mode:Server.js:origin: "http://localhost:3000",
const PORT = process.env.PORT || 3001;

App.tsx:socketRef.current = io('http://localhost:3001');

Script:"start": "react-scripts start",