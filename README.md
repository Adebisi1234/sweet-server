This server is meant to serve static files only
HTML, CSS, JS (No framework support for now)

APPROACH:

what do i want to do

HMR

What is hmr
hot module reload
A case where file updates are reflected without reloading the entire app

Caveats

- Top level es modules triggers a reload
- Only keep track of imports and exports
- When a file changes, recall all modules using all imports from the file
- - how do i do this
- - - During the parsing process, in every function call that has the module export in it's props or body, pass the function name to the hmr client which stores it in the modules callback, and recalls when the modules change
- But what if the return value is assigned to a variable or used in another function??

- Actually when a module changes, it should be it's dependencies that get's recall,

- How do I recall a module???
- - Using eval????

Let say I have a main function that requires all the modules right
and then runs it the first time

Then on change it reruns.

Will that break things

For this not to break things I'll need to have a clear effect function that cleans up after the main function before rerun
