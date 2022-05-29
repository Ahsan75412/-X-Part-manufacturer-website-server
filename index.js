const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;
 
 
//use middleware
 
app.use(cors());
app.use(express.json());
 
 
//connect to mongodb

const uri = "mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tb0uxuv.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// console.log(uri);

async function run(){
    try{
        await client.connect();
        const productsCollection = client.db("x-part").collection("products");
        console.log('Connected to MongoDB');

        app.get("/products/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const product = await productsCollection.findOne(query);
            res.send(product);
        });
    }
    finally{
        // client.close();
    }
}


run().catch(console.dir);




 
app.get('/', (req, res) => {
    res.send('Running X-part Manager Server');
});
 
app.listen(port, () =>{
    console.log(`Server is running on port ${port}`);
});