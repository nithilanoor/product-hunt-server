const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
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
        // await client.connect();



        const productsCollection = client.db("productHunt").collection("products");
        const reviewsCollection = client.db("productHunt").collection("reviews");
        const paymentsCollection = client.db("productHunt").collection("payments");
        const usersCollection = client.db("productHunt").collection("users");
        const couponsCollection = client.db("productHunt").collection("coupons");




        // jwt
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '24h' });
            res.send({ token });
        })

        // middlewares
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }


        // users related APIs
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });

        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.patch('/users/moderator/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'moderator'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })


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

        app.post("/products", async (req, res) => {
            try {
                const { name, image, description, tags, external_link, owner } = req.body;


                if (!name || !image || !description || !owner || !owner.name || !owner.email || !owner.image) {
                    return res.status(400).json({ message: "Missing required fields" });
                }

                const newProduct = {
                    name,
                    image,
                    description,
                    tags: tags || [],
                    external_link: external_link || "",
                    upvotes: 0,
                    owner: {
                        name: owner.name,
                        email: owner.email,
                        image: owner.image,
                    },
                    status: "Accepted",
                    createdAt: new Date().toISOString(),
                    category: "new",
                };

                const result = await productsCollection.insertOne(newProduct);

                if (result.insertedId) {
                    res.status(201).json({ message: "Product added successfully", productId: result.insertedId });
                } else {
                    res.status(500).json({ message: "Failed to add product" });
                }
            } catch (error) {
                console.error("Error adding product:", error);
                res.status(500).json({ message: "Server error" });
            }
        });

        app.get("/myProducts", async (req, res) => {

            const email = req.query.email;
            let query = {};
            if (email) {
                query = { "owner.email": email }
            }
            const cursor = productsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result)
        });

        app.delete('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        });






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


        // coupons
        app.get('/coupons', async (req, res) => {
            const coupons = await couponsCollection.find().toArray();
            res.send(coupons)
        })

        app.post('/coupons', async (req, res) => {
            try {
                console.log("Received data:", req.body);

                const { code, discount, expiryDate } = req.body;
                const parsedDate = new Date(expiryDate);

                if (isNaN(parsedDate.getTime())) {
                    return res.status(400).send({ error: "Invalid date format" });
                }

                const newCoupon = {
                    code: code || "N/A",
                    discount: Number(discount) || 0,
                    expiryDate: parsedDate
                };

                console.log("Processed data:", newCoupon);

                const result = await couponsCollection.insertOne(newCoupon);
                res.send(result);
            } catch (error) {
                console.error("Error adding coupon:", error);
                res.status(500).send({ error: "Server error" });
            }
        });

        app.delete('/coupons/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const result = await couponsCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 1) {
                    res.send({ success: true, message: "Coupon deleted successfully" });
                } else {
                    res.status(404).send({ success: false, message: "Coupon not found" });
                }
            } catch (error) {
                console.error("Error deleting coupon:", error);
                res.status(500).send({ success: false, error: "Server error" });
            }
        });





        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })

        })

        app.get('/payments', async (req, res) => {
            const payments = await paymentsCollection.find().toArray();
            res.send(payments)
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentsCollection.insertOne(payment);
            res.send(paymentResult)
        })


        // stats
        app.get('/stats', verifyToken, verifyAdmin, async (req, res) => {
            const products = await productsCollection.estimatedDocumentCount();
            const users = await usersCollection.estimatedDocumentCount();
            const reviews = await reviewsCollection.countDocuments();
            res.send({ products, users, reviews })
        })




        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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