const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
 
 
//use middleware
 
app.use(cors());
app.use(express.json());
 
 
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send("Unauthorized");
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send("Forbidden");
        }
        req.decoded = decoded;
        next();
    });
}

//connect to mongodb

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tb0uxuv.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// console.log(uri);
async function run() {
    try {
        await client.connect();
        const productsCollection = client.db("x-part").collection("products");
        const ordersCollection = client.db("x-part").collection("orders");
        const userCollection = client.db("x-part").collection("users");
        const paymentsCollection = client.db("x-part").collection("payments");
        const reviewCollection = client.db("x-part").collection("review");
        const infoCollection = client.db("x-part").collection("info");

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({
                email: requester,
            });
            if (requesterAccount.role === "admin") {
                next();
            } else {
                res.status(403).send("Forbidden");
            }
        };

        app.put(
            "/user/admin/:email",
            verifyJWT,
            verifyAdmin,
            async (req, res) => {
                const email = req.params.email;
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: "admin" },
                };
                const result = await userCollection.updateOne(
                    filter,
                    updateDoc
                );
                res.send(result);
            }
        );

        app.get("/admin/:email", async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === "admin";
            res.send({ admin: isAdmin });
        });

        app.put("/user/:email", async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(
                filter,
                updateDoc,
                options
            );
            const token = jwt.sign(
                { email: email },
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: "1d" }
            );
            res.send({ result, token });
        });

        app.get("/user", async (req, res) => {
            const users = await userCollection.find({}).toArray();
            res.send(users);
        });

        // payment routes
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const products = req.body;
            const price = products.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // get all products
        app.get("/products", async (req, res) => {
            const query = {};
            const cursor = productsCollection.find(query);
            const products = await cursor.toArray();
            res.send(products);
        });
        // post new product
        app.post("/products", verifyJWT, verifyAdmin, async (req, res) => {
            const newProduct = req.body;
            const result = await productsCollection.insertOne(newProduct);
            res.send(result);
        });

        // get product by id
        app.get("/products/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const product = await productsCollection.findOne(query);
            res.send(product);
        });
        //get all orders
        app.get("/orders", verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const cursor = ordersCollection.find(query);
                const orders = await cursor.toArray();
                return res.send(orders);
            } else {
                return res.status(403).send("Forbidden");
            }
        });
        app.get("/allOrders", verifyJWT, async (req, res) => {
            const query = {};
            const cursor = ordersCollection.find(query);
            const orders = await cursor.toArray();
            res.send(orders);
        });

        app.get("/orders/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const orders = await ordersCollection.findOne(query);
            res.send(orders);
        });
        // post new order
        app.post("/orders", async (req, res) => {
            const order = req.body;
            const result = await ordersCollection.insertOne(order);
            res.send(result);
        });

        app.patch("/orders/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;

            const query = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,
                },
            };
            const result = await paymentsCollection.insertOne(payment);
            const updatedOrder = await ordersCollection.updateOne(
                query,
                updatedDoc
            );
            res.send(updatedDoc);
        });

        //approve order
        app.put("/orders/status/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateStatus = { $set: { status: "paid" } };
            const result = await ordersCollection.updateOne(
                query,
                updateStatus,
                options
            );
            res.json(result);
        });

        // delete a product

        app.delete(
            "/products/:id",
            verifyJWT,
            verifyAdmin,
            async (req, res) => {
                const id = req.params.id;
                const query = { _id: ObjectId(id) };
                const result = await productsCollection.deleteOne(query);
                res.send(result);
            }
        );
        //update a product
        app.put("/products/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const newQuantity = req.body.updatedQuantity;
            const newPrice = req.body.updatedPrice;
            const result = await productsCollection.updateOne(
                query,
                {
                    $set: { availableQty: newQuantity, price: newPrice },
                },
                options
            );
            res.send(result);
            console.log(newPrice);
        });

        // delete an order

        app.delete("/orders/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await ordersCollection.deleteOne(query);
            res.send(result);
        });

        //add a review
        app.post("/reviews", async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        });
        // get all review
        app.get("/reviews", async (req, res) => {
            const cursor = reviewCollection.find({});
            const reviews = await cursor.toArray();
            res.send(reviews);
        });

        //post profile info
        app.post("/info", async (req, res) => {
            const review = req.body;
            const result = await infoCollection.insertOne(review);
            res.send(result);
        });
        // get info
        app.get("/info", async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const cursor = await infoCollection.find(query);
            const info = await cursor.toArray();
            res.send(info);
            console.log(cursor);
        });

        // update profile
        app.put("/info", async (req, res) => {
            const email = req.query.email;

            const query = { email: email };
            const options = { upsert: true };
            const newLivesIn = req.body.updatedLivesIn;
            const newStudyIn = req.body.updatedStudyIn;
            const newPhone = req.body.updatedPhone;
            const newLinkedIn = req.body.updatedLinkedIn;
            const newGithub = req.body.updatedGithub;
            const newFacebook = req.body.updatedFacebook;
            const result = await infoCollection.updateOne(
                query,
                {
                    $set: {
                        livesIn: newLivesIn,
                        studyIn: newStudyIn,
                        phone: newPhone,
                        linkedIn: newLinkedIn,
                        github: newGithub,
                        facebook: newFacebook,
                    },
                },

                options
            );
            res.json(result);
            console.log(newLivesIn);
        });
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);




 
app.get('/', (req, res) => {
    res.send('Running X-part Manager Server');
});
 
app.listen(port, () =>{
    console.log(`Server is running on port ${port}`);
});