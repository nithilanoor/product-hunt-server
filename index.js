const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;


// middleware
app.use(cors());
app.use(express.json());





const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xj6bm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();



        const productsCollection = client.db("productHunt").collection("products");
        const reviewsCollection = client.db("productHunt").collection("reviews");




        // product related APIs
        app.get('/products', async (req, res) => {
            const result = await productsCollection.find().toArray();
            res.send(result);
        })

        app.get('/featured/products', async (req, res) => {
            const cursor = productsCollection.find({ category: "featured" }).sort({ createdAt: -1 }).limit(5);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/trending/products', async (req, res) => {
            const cursor = productsCollection.find({ category: "trending" }).sort({ upvotes: -1 }).limit(7);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/accepted/products', async (req, res) => {
            const { search, page = 1, limit = 6 } = req.query;
            const query = { status: "Accepted" };
            if (search) {
                query.tags = { $regex: search, $options: "i" };
            }
            const products = await productsCollection.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)).toArray();

            const totalProducts = await productsCollection.countDocuments(query);
            const result = ({ products, totalPages: Math.ceil(totalProducts / limit) });
            res.send(result);
        })

        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.findOne(query);
            res.send(result);
        })


        // review related APIs
        app.get('/reviews/:productId', async (req, res) => {
            const productId = req.params.productId;
            const reviews = await reviewsCollection.find({ productId }).toArray();
            res.send(reviews);
        })

        app.post('/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        })



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);





app.get('/', (req, res) => {
    res.send('Product Hunt Server is running.')
});

app.listen(port, () => {
    console.log(`Product Hunt Server is running on port: ${port}`)
});