const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const { MongoClient } = require('mongodb');
const axios = require('axios');
const { GooglePaLMEmbeddings } = require('@langchain/community/embeddings/googlepalm');
// Assuming RecursiveCharacterTextSplitter is available from a similar package
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

const app = express();
const upload = multer({ dest: 'uploads/' });

// MongoDB and Pinecone setup
const mongoUri = 'mongodb+srv://aaron:Aaron123@cluster0.0ufwbae.mongodb.net/?retryWrites=true&w=majority'; // Replace with your actual MongoDB URI
const client = new MongoClient(mongoUri);
const dbName = 'Cluster0'; // Specify your actual database name
const collectionName = 'documents'; // Specify your actual collection name
const pineconeApiKey = '68220ca2-cb3b-4952-bc99-62990dcfbd38'; // Replace with your actual Pinecone API key
const pineconeProjectEndpoint = 'https://palm-bff4931.svc.gcp-starter.pinecone.io'; // Replace with your actual Pinecone project endpoint

// Configure Axios for Pinecone
const pineconeAxios = axios.create({
    baseURL: pineconeProjectEndpoint,
    headers: {
        'Api-Key': pineconeApiKey,
        'Content-Type': 'application/json'
    }
});

app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        const filePath = req.file.path;
        const textContent = await fs.readFile(filePath, 'utf8');

        // Use RecursiveCharacterTextSplitter for chunking the document
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000, // Define your chunk size
        });
        const chunks = splitter.createDocuments([textContent]); // Assuming .split() is the method to use

        // Process each chunk to generate embeddings
        const embeddingsPromises = chunks.map(async (chunk, index) => {
            const googlePaLMEmbeddings = new GooglePaLMEmbeddings({
                apiKey: 'AIzaSyBysL_SjXQkJ8lI1WPTz4VwyH6fxHijGUE',
            });
            const embeddings = await googlePaLMEmbeddings.embedQuery(chunk);
            // Optionally: Store each chunk in MongoDB or handle as needed
            return embeddings;
        });

        const embeddingsResults = await Promise.all(embeddingsPromises);

        // Upload embeddings to Pinecone
        for (let i = 0; i < chunks.length; i++) {
            const vectorId = `document_${req.file.filename}_${i}`;
            await pineconeAxios.post('/vectors/upsert', {
                namespace: 'your_namespace', // Replace with your actual namespace in Pinecone
                vectors: [{
                    id: vectorId,
                    values: embeddingsResults[i],
                }],
            });
        }

        res.json({ message: 'Document processed and embeddings generated and uploaded for all chunks.' });
    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).send('Error processing upload.');
    } finally {
        await client.close();
    }
});

const port = process.env.PORT || 8000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
