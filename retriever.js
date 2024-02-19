const axios = require('axios');
const { MongoClient, ObjectId } = require('mongodb');
const { GooglePaLMEmbeddings } = require("@langchain/community/embeddings/googlepalm");
const { response } = require('express');

// MongoDB setup
const mongoUri = 'mongodb+srv://aaron:Aaron123@cluster0.0ufwbae.mongodb.net/?retryWrites=true&w=majority'; // Replace with your MongoDB URI
const client = new MongoClient(mongoUri);
const dbName = 'Cluster0'; // Your MongoDB database name
const collectionName = 'documents'; // Your MongoDB collection name

// Configure Axios for Pinecone
const pineconeAxios = axios.create({
    baseURL: "https://palm-bff4931.svc.gcp-starter.pinecone.io", // Replace with your Pinecone base URL
    headers: {
        'Api-Key': "68220ca2-cb3b-4952-bc99-62990dcfbd38", // Replace with your Pinecone API key
        'Content-Type': 'application/json'
    }
});

const huggingFaceAxios = axios.create({
    headers: {
        'Authorization': 'Bearer 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' // Replace with your Hugging Face API key
    }
});

// Function to generate text embeddings using Google PaLM API
async function generateTextEmbeddings(text) {
    try {
        const model = new GooglePaLMEmbeddings({
            apiKey: "AIzaSyBysL_SjXQkJ8lI1WPTz4VwyH6fxHijGUE", // Replace with your actual API key
            modelName: "models/embedding-gecko-001",
        });

        const embeddings = await model.embedQuery(text);
        return embeddings;
    } catch (error) {
        console.error('Error generating text embeddings:', error);
        throw new Error('Error generating text embeddings.');
    }
}

// Function to search in Pinecone based on embeddings and retrieve metadata
async function searchInPinecone(embeddings) {
    try {
        const response = await pineconeAxios.post('/query', {
            namespace: 'your-namespace', // Replace with your actual namespace
            vector: embeddings,
            topK: 5, // Adjust based on how many results you want
            includeMetadata: true // Ensure metadata is included in the response
        });
        return response.data;
    } catch (error) {
        console.error('Error searching in Pinecone:', error);
        throw new Error('Error performing search.');
    }
}

// Function to fetch document texts from MongoDB using their IDs
async function getTextsFromMongoDB(documentIds) {
    let texts = [];
    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        
        for (let documentId of documentIds) {
            const document = await collection.findOne({ _id: new ObjectId(documentId) });
            texts.push(document.text); // Assuming the text is stored under the "text" field
        }
    } catch (error) {
        console.error('Error fetching text from MongoDB:', error);
        throw error;
    } finally {
        await client.close();
    }
    return texts;
}

async function generateContextualAnswer(context, question) {
    try {
        // Structuring the payload with question and context as strings
        const payload = {
            inputs: {
                question: question,
                context: context
            }
        };

        // Using JSON.stringify to log the payload for inspection
        JSON.stringify(payload, null, 2);

        const response = await huggingFaceAxios.post(
            "https://api-inference.huggingface.co/models/bert-large-uncased-whole-word-masking-finetuned-squad",
            payload
        );

        // Assuming the response structure has the answer in a specific format; adjust based on actual response
        // Logging the raw API response for debugging
        // console.log("Raw response from Hugging Face API:", JSON.stringify(response.data, null, 2));

        return response.data.answer;
    } catch (error) {
        console.error('Error generating answer with Hugging Face:', error.response?.data || error.message);
        // Including JSON.stringify for detailed error logging
        console.error('Detailed error:', JSON.stringify(error.response?.data, null, 2));
        throw new Error('Failed to generate answer with Hugging Face.');
    }
}
// Main function to perform a semantic search and display results
async function performSemanticSearch(query) {
    console.log(`Query: ${query}`);
    const embeddings = await generateTextEmbeddings(query);
    const searchResults = await searchInPinecone(embeddings);
    console.log('Search Results:', searchResults);

    // Extract document IDs from the search results
    const documentIds = searchResults.matches.map(match => match.id);

    // Fetch the corresponding texts from MongoDB
    const documentsText = await getTextsFromMongoDB(documentIds);

    // Display the results along with their texts
    if (documentsText.length > 0) {
        const context = documentsText[0]; // Using the first document as context
        const answer = await generateContextualAnswer(context, query);
        console.log('Generated Answer:', answer);
    } else {
        console.log('No documents found for the query.');
    }
}

// Example usage
const query = "Who took flight in the heart of Chicago?";
performSemanticSearch(query)