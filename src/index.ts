#! /usr/bin/env node

import express from "express";

const app = express();

app.use(express.static(process.cwd()));

const port = process.env.PORT || 6001;

const server = app.listen(port, () => {
  console.log(`App started  on port ${port}...`);
  console.log(process.cwd());
});
