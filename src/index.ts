import server from "./server";

server.listen({ hostname: "0.0.0.0", port: 3000 });
console.log("Server is running on http://localhost:3000");
