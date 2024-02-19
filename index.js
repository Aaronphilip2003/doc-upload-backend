const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const { GooglePaLMEmbeddings } = require("@langchain/community/embeddings/googlepalm");

const app = express();
// Configure multer to use memory storage
const upload = multer({ storage: multer.memoryStorage() });

// MongoDB setup
const mongoUri = 'mongodb+srv://aaron:Aaron123@cluster0.0ufwbae.mongodb.net/?retryWrites=true&w=majority';
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

// Modified to handle text extraction from a buffer
async function extractText(buffer) {
    try {
        const textContent = buffer.toString('utf8');
        console.log("File read successfully from buffer");
        return textContent;
    } catch (error) {
        console.error('Error reading from buffer:', error);
        throw new Error('Error processing buffer.');
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
        // Now using the buffer directly from the uploaded file
        const buffer = req.file.buffer;
        const text = await extractText(buffer);
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
