import { app } from "./app.js"
import { env } from "./configs/env.js"

app.listen(env.PORT, () => {
	console.log(`Ecommerce API listening on port ${env.PORT}`)
})
