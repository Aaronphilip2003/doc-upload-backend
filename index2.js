const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs').promises;
const { MongoClient } = require('mongodb');
const { GooglePaLMEmbeddings } = require("@langchain/community/embeddings/googlepalm");

const app = express();
const upload = multer({ dest: 'uploads/' });

// MongoDB setup
const mongoUri = 'mongodb+srv://aaron:Aaron123@cluster0.0ufwbae.mongodb.net/?retryWrites=true&w=majority'; // Replace with your actual MongoDB URI
const client = new MongoClient(mongoUri);
const dbName = 'Cluster0'; // Specify your actual database name
const collectionName = 'documents'; // Specify your actual collection name

// Google PaLM Embeddings setup
const palmApiKey = 'AIzaSyBysL_SjXQkJ8lI1WPTz4VwyH6fxHijGUE'; // Replace with your actual API key

// Pinecone setup
const pineconeAxios = axios.create({
    baseURL: 'https://palm-bff4931.svc.gcp-starter.pinecone.io', // Replace with your actual Pinecone project endpoint
    headers: {
        'Api-Key': '68220ca2-cb3b-4952-bc99-62990dcfbd38', // Replace with your actual Pinecone API key
        'Content-Type': 'application/json'
    }
});

async function saveTextToMongoDB(text) {
    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        const result = await collection.insertOne({ text });
        console.log(`Text saved to MongoDB with _id: ${result.insertedId}`);
        return result.insertedId;
    } finally {
        await client.close();
    }
}

async function extractText(filePath) {
    try {
        const textContent = await fs.readFile(filePath, 'utf8');
        console.log("File read successfully");
        return textContent;
    } catch (error) {
        console.error('Error reading file:', error);
        throw new Error('Error processing file.');
    }
}

async function generateTextEmbeddings(text) {
    try {
        const model = new GooglePaLMEmbeddings({ apiKey: palmApiKey });
        const embeddings = await model.embedQuery(text);
        return embeddings;
    } catch (error) {
        console.error('Error generating text embeddings:', error);
        throw new Error('Error generating text embeddings.');
    }
}

app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    try {
        const filePath = req.file.path;
        const text = await extractText(filePath);
        const embeddings = await generateTextEmbeddings(text);
        const mongoDocumentId = await saveTextToMongoDB(text);
        const vectorId = mongoDocumentId.toString();

        // Upload the embeddings to Pinecone with the MongoDB document ID as a reference
        const pineconeResponse = await pineconeAxios.post('/vectors/upsert', {
            namespace: 'your-namespace', // Replace with your actual namespace
            vectors: [{
                id: vectorId,
                values: embeddings,
            }],
        });

        res.json({
            message: 'Document and embeddings successfully uploaded.',
            mongoDocumentId: mongoDocumentId,
            pineconeResponse: pineconeResponse.data
        });
        console.log('Upload to pinecone complete.');
    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).send('Error processing upload.');
    }
});

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`Server running on port ${port}`));
