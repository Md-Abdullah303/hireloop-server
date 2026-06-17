const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const cors = require("cors");
const port = 5000;

// middleware
app.use(cors());
app.use(express.json());
require("dotenv").config();

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = process.env.MONGODB_URL || 3333;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("hireloop_db");
    const jobCollection = database.collection("jobs");
    const companyCollection = database.collection("companies");
    const applicationCollection = database.collection("applications");
    const userCollection = database.collection("user");
    const planCollection = database.collection("plans");
    const sessionCollection = database.collection("session");
    const subscriptionCollection = database.collection(
      "subscriptionCollections",
    );

    // verification
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers?.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const query = { token: token };
      const session = await sessionCollection.findOne(query);
      const userId = session?.userId;

      const userQuery = { _id: userId };
      const user = await userCollection.findOne(userQuery);
      if (!user) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      req.user = user;
      next();
    };

    // must by use after verifyToken
    const verifySeeker = async (req, res, next) => {
      if (req.user?.role !== "seeker") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyRecruiter = async (req, res, next) => {
      if (req.user?.role !== "recruiter") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // jobs
    app.get("/api/all/jobs", async (req, res) => {
      const query = {};

      // filter raleted work
      if (req.query.search) {
        query.$or = [
          { jobTitle: { $regex: req.query.search, $options: "i" } },
          { companyName: { $regex: req.query.search, $options: "i" } },
        ];
      }
      if (req.query.jobType) {
        query.jobType = req.query.jobType;
      }
      if (req.query.isRemote) {
        query.isRemote = true;
      }

      // pagination
      if (req.query.page) {
        const page = req.query.page;
        const perPage = 12;
        const skipItems = (page - 1) * perPage;

        const total = await jobCollection.countDocuments(query);
        const cursor = jobCollection.find(query).skip(skipItems).limit(perPage);
        const jobs = await cursor.toArray();
        return res.send({ total, jobs });
      }

      const cursor = jobCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/api/jobs", async (req, res) => {
      const query = {};
      const companyId = req.query.companyId;
      const status = req.query.status;

      if (companyId) {
        query.companyId = companyId;
      }
      if (status) {
        query.status = status;
      }

      const cursor = jobCollection.find(query);
      const result = await cursor.toArray();
      res.json(result);
    });

    app.get("/api/jobs/:id", async (req, res) => {
      const { id } = req.params;

      const query = {
        _id: new ObjectId(id),
      };

      const result = await jobCollection.findOne(query);
      res.send(result);
    });

    app.post("/api/jobs", async (req, res) => {
      const job = req.body;
      const newJob = {
        ...job,
        createdAt: new Date(),
      };
      const result = await jobCollection.insertOne(newJob);
      console.log("/api/jobs", result);
      res.send(result);
    });

    app.patch("/api/jobs", async (req, res) => {
      const { jobId } = req.query;
      const editData = req.body;

      console.log("From Patch api: ", jobId, editData);

      const filter = {
        _id: new ObjectId(jobId),
      };
      const updatedDocument = {
        $set: {
          ...editData,
        },
      };

      const result = await jobCollection.updateOne(filter, updatedDocument);
      res.json(result);
    });

    app.delete("/api/jobs", async (req, res) => {
      const { jobId } = req.query;
      const deleteJob = {
        _id: new ObjectId(jobId),
      };
      console.log(deleteJob, jobId);
      const result = await jobCollection.deleteOne(deleteJob);
      res.json(result);
    });

    // company related api
    app.get("/api/companies", verifyToken, async (req, res) => {
      const cursor = companyCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/api/my/companies", async (req, res) => {
      const query = {};
      const { recruiterId } = req.query;

      if (recruiterId) {
        query.recruiterId = recruiterId;
      }
      const result = await companyCollection.findOne(query);
      res.json(result);
    });

    app.post("/api/companies", async (req, res) => {
      const company = req.body;
      const newCompany = {
        ...company,
        createdAt: new Date(),
      };
      const result = await companyCollection.insertOne(newCompany);
      res.send(result);
    });

    app.patch(
      "/api/companies/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const updatedCompany = req.body;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: updatedCompany.status,
          },
        };
        const result = await companyCollection.updateOne(filter, updatedDoc);
        res.send(result);
      },
    );

    // application related api
    app.get(
      "/api/applications",
      verifyToken,
      verifySeeker,
      async (req, res) => {
        const query = {};
        if (req.query.applicantId) {
          query.applicantId = req.query.applicantId;

          // check whether asking for user information or someone else
          console.log("from test", req.user, req.query.applicantId);
          if (req.user?._id.toString() !== req.query.applicantId) {
            return res.status(403).send({ message: "forbidden access" });
          }
        }
        if (req.query.jobId) {
          query.jobId = req.query.jobId;
        }
        const cursor = applicationCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      },
    );

    app.post("/api/applications", async (req, res) => {
      const applicant = req.body;
      const newApplicant = {
        ...applicant,
        applyingAt: new Date(),
      };
      const result = await applicationCollection.insertOne(newApplicant);
      res.send(result);
    });

    // plans related api
    app.get("/api/plans", async (req, res) => {
      const query = {};
      if (req.query.planId) {
        query.planId = req.query.planId;
      }
      const result = await planCollection.findOne(query);
      res.send(result);
    });

    // subscription related api
    app.post("/api/subscriptions", async (req, res) => {
      const data = req.body;
      const subsInfo = {
        ...data,
        createdAt: new Date(),
      };
      const result = await subscriptionCollection.insertOne(subsInfo);

      // update the use plan
      const filter = {
        email: data.email,
      };
      const updateDocument = {
        $set: {
          plan: data.planId,
        },
      };

      const updateResult = await userCollection.updateOne(
        filter,
        updateDocument,
      );
      res.send(updateResult);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
