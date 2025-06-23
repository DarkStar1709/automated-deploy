# Use the official Node.js 20 LTS image as the base image
FROM node:20-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies.  Use --frozen-lockfile for production.
RUN npm ci --omit=dev

# Copy the source code to the working directory
COPY . .

# Build the application (if necessary).  Adjust command if you have a build step.
# Example for a Next.js app:
# RUN npm run build

# Production image, smaller and more secure
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy only the necessary files from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

# Expose the port your application listens on.  Change if needed.
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV production

# Define the command to start your application. Adjust command if needed.
CMD ["node", "index.js"]