const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')

const port = process.env.PORT || 5000

// middleware
const corsOptions = {
    origin: ['https://studymate-d87d7.web.app', 'http://localhost:5173'],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log(err)
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded
        next()
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5mrfovz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
})

async function run() {
    try {
        const usersCollection = client.db('studyMate').collection('users')
        const studySessionsCollection = client.db('studyMate').collection('sessions')
        const bookedSessionsCollection = client.db('studyMate').collection('bookedSessions')
        const reviewsCollection = client.db('studyMate').collection('reviews');
        const notesCollection = client.db('studyMate').collection('notes');

        // Connect the client to the server
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '365d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    // httpOnly: true,
                    // secure: true,
                    // sameSite: 'None',
                })
                .send({ success: true })
        })
        // Logout
        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
                console.log('Logout successful')
            } catch (err) {
                res.status(500).send(err)
            }
        })


        // verify studen middelware !!! I don't know why it is not working
        const verifyStudent = async (req, res, next) => {
            const user = req.user
            const query = { email: user?.email }
            const result = await usersCollection.findOne(query)

            if (!result || result?.role !== 'student')
                return res.status(401).send({ message: 'Unauthorized access' })

            next()
        }

        // verify tutor tutor !!! I don't know why it is not working
        const verifyTutor = async (req, res, next) => {
            const user = req.user
            const query = { email: user?.email }
            console.log(query);
            const result = await usersCollection.findOne(query)

            if (!result || result?.role !== 'tutor')
                return res.status(401).send({ message: 'Unauthorized access' })

            next()
        }

        // verify admin middleware
        const verifyAdmin = async (req, res, next) => {
            const user = req.user
            const query = { email: user?.email }
            const result = await usersCollection.findOne(query)

            if (!result || result?.role !== 'admin')
                return res.status(401).send({ message: 'Unauthorized access' })

            next()
        };

        // save a user data in db
        app.put('/user', async (req, res) => {
            const user = req.body

            const query = { email: user?.email }
            // check if user already exists in db
            const isExist = await usersCollection.findOne(query)
            if (isExist) {
                if (user.status === 'Requested') {
                    // if existing user try to change his role
                    const result = await usersCollection.updateOne(query, {
                        $set: { status: user?.status },
                    })
                    return res.send(result)
                } else {
                    // if existing user login again
                    return res.send(isExist)
                }
            }

            // save user for the first time
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...user,
                    timestamp: Date.now(),
                },
            }
            const result = await usersCollection.updateOne(query, updateDoc, options)
            res.send(result)
        });


        // Get user by email from database
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email
            const result = await usersCollection.findOne({ email })
            res.send(result)
        });

        // Get only approved study sessions not more than 6
        app.get('/approved-sessions', async (req, res) => {
            const result = await studySessionsCollection.find({ status: 'approved' }).limit(6).toArray()
            res.send(result)
        });

        // get all sessions from db
        app.get('/sessions', async (req, res) => {
            const result = await studySessionsCollection.find().toArray()
            res.send(result)
        });


        // get a singel session by id from db
        app.get('/session/:id', async (req, res) => {
            const id = req.params.id
            const result = await studySessionsCollection.findOne({ _id: new ObjectId(id) })
            res.send(result)
        });

        // book a session
        // TODO User can book a session only once.
        app.post('/book-session', async (req, res) => {
            const { studentEmail, sessionId, tutorEmail, sessionTitle, role } = req.body

            if (role === 'admin' || role === 'tutor') {
                return res.status(401).send({ message: 'Unauthorized access' })
            }

            const query = { studentEmail, sessionId, tutorEmail, sessionTitle }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    timestamp: Date.now(),
                },
            }
            const result = await bookedSessionsCollection.updateOne(query, updateDoc, options)
            res.send(result)
        });

        // view booked session by id
        app.get('/view-booked-session/:id', async (req, res) => {
            const id = req.params.id
            const result = await studySessionsCollection.findOne({ _id: new ObjectId(id) })
            console.log(result);
            res.send(result)
        })

        // store review in db
        app.post('/review', async (req, res) => {
            const review = req.body
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...review,
                    timestamp: Date.now(),
                },
            }
            const result = await reviewsCollection.updateOne(review, updateDoc, options)
            res.send(result)
        });

        // Students can view his/her booked sessions.
        // get all booked sessions by student email
        app.get('/booked-sessions/:email', verifyToken, verifyStudent, async (req, res) => {
            const email = req.params.email
            const result = await bookedSessionsCollection.find({ studentEmail: email }).toArray()
            res.send(result)
        });

        // Post a note to the database
        app.post('/create-note', async (req, res) => {
            const note = req.body
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...note,
                    timestamp: Date.now(),
                },
            }
            const result = await notesCollection.updateOne(note, updateDoc, options)
            res.send(result)
        });

        // Get all notes by student email
        app.get('/notes/:email', async (req, res) => {
            const email = req.params.email
            const result = await notesCollection.find({ studentEmail: email }).toArray()
            res.send(result)
        });

        // get notes by user email and note id
        app.get('/note/:email/:id', async (req, res) => {
            const email = req.params.email
            const id = req.params.id
            const result = await notesCollection.findOne({ studentEmail: email, _id: new ObjectId(id) })
            res.send(result)
        });

        // update a note by user email and note id
        app.put('/note/:email/:id', async (req, res) => {
            const email = req.params.email
            const id = req.params.id
            const note = req.body
            const query = { studentEmail: email, _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...note,
                    timestamp: Date.now(),
                },
            }
            const result = await notesCollection.updateOne(query, updateDoc, options)
            res.send(result)
        });

        // delete a note by user email and note id
        app.delete('/note/:email/:id', async (req, res) => {
            const email = req.params.email
            const id = req.params.id
            const query = { studentEmail: email, _id: new ObjectId(id) }
            const result = await notesCollection.deleteOne(query)
            res.send(result)
        });

        // get all tutor form db with status approved and role tutor
        app.get('/tutors', async (req, res) => {
            const result = await usersCollection.find({ status: 'Verified', role: 'tutor' }).toArray()
            res.send(result)
        });


        // Create study session Tutor will create a session by user email
        app.post('/create-session/:email', async (req, res) => {
            const email = req.params.email
            const session = req.body
            const query = { email, role: 'tutor' }
            const result = await usersCollection.findOne(query)
            if (!result) {
                return res.status(401).send({ message: 'Unauthorized access' })
            }

            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...session,
                    timestamp: Date.now(),
                },
            }
            const sessionResult = await studySessionsCollection.updateOne(session, updateDoc, options)
            res.send(sessionResult)
        });

        // View all study sessions route created by tutor email and role tutor
        app.get('/view-sessions/:email', async (req, res) => {
            const email = req.params.email
            const query = { tutorEmail: email }
            const result = await studySessionsCollection.find(query).toArray()
            res.send(result)
        });

        // view session by id created by tutor email
        app.get('/session/:email/:id', async (req, res) => {
            const email = req.params.email
            const id = req.params.id
            const query = { tutorEmail: email, _id: new ObjectId(id) }
            const result = await studySessionsCollection.findOne(query)
            res.send(result)
        });

        // delete session by tutor email and session id
        app.delete('/session/:email/:id', async (req, res) => {
            const email = req.params.email
            const id = req.params.id
            const query = { tutorEmail: email, _id: new ObjectId(id) }
            const result = await studySessionsCollection.deleteOne(query)
            res.send(result)
        });

        // update session by tutor email and session id
        app.put('/session/:email/:id', async (req, res) => {
            const email = req.params.email
            const id = req.params.id
            const session = req.body
            const query = { tutorEmail: email, _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...session,
                    timestamp: Date.now(),
                },
            }
            const result = await studySessionsCollection.updateOne(query, updateDoc, options)
            res.send(result)
        });

        // get all users for admin only with verifyAdmin
        // app.get('/users', verifyAdmin, async (req, res) => {
        // verifyAdmin is not working! I don't know why
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        });

        // Send a ping to confirm a successful connection
        // await client.db('admin').command({ ping: 1 })
        // console.log(
        //     'Pinged your deployment. You successfully connected to MongoDB!'
        // )
    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello StudyMate')
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})
