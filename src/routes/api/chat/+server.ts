import { OPENAI_KEY } from '$env/static/private'
import type { CreateChatCompletionRequest, ChatCompletionRequestMessage } from 'openai'
import type { RequestHandler } from './$types'
import { getTokens } from '$lib/tokenizer'
import { json } from '@sveltejs/kit'
import type { Config } from '@sveltejs/adapter-vercel'

export const config: Config = {
	runtime: 'edge'
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		if (!OPENAI_KEY) {
			throw new Error('OPENAI_KEY env variable not set')
		}

		const requestData = await request.json()

		if (!requestData) {
			throw new Error('No request data')
		}

		const reqMessages: ChatCompletionRequestMessage[] = requestData.messages

		if (!reqMessages) {
			throw new Error('no messages provided')
		}

		let tokenCount = 0

		reqMessages.forEach((msg) => {
			const tokens = getTokens(msg.content)
			tokenCount += tokens
			console.log('tokencount: ' + tokenCount)
		})

		const moderationRes = await fetch('https://api.openai.com/v1/moderations', {
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${OPENAI_KEY}`
			},
			method: 'POST',
			body: JSON.stringify({
				input: reqMessages[reqMessages.length - 1].content
			})
		})

		const moderationData = await moderationRes.json()
		const [results] = moderationData.results

		if (results.flagged) {
			throw new Error('Query flagged by openai')
		}

		const prompt = `This is a role-playing game where you'll be both the 3rd person narrator and the 1st person character. You'll describe the world from a 3rd person perspective and interact with the player from a 1st person perspective. You can be an ally to the player, give them quests, and create a storyline based on their choices.

		When you write your messages, focus writing them from 1st person character's eye rather than 3rd person narrator and always give player 3 unique choices to choose from at the end of your message. If you don't have too much choices to give, don't forget to give at least 2 choices! Game is getting bugged if you forget giving choices! Always give at least 2, ideally 3 choices.
		Game only ends when the player's health points drop to 0.
		Don't make your choices! Always ask the player what they should do next.
		To give joy and spirit to the characters, write your messages in a dramatic way as if you were them and let them have their unique characteristics. If the player wants to leave or quit the current conversation, give them choices to go or do something different. If there is a farewell in conversation, let it end. When the player meets someone else, start chatting from the 1st person perspective of that new person.
		make your responses only 1 paragraph! you are making them too long.
		Any meal, drink, weapon, armor, spellbook must have a price. If something has a price, always write the price at the end of the selectable choice. Don't forget to write the prices of everything that is for sale. Sometimes in the game, when the player buys something, the chat response might say "That'll be 2 gold, please." This is not correct, because the trade being already happened at that point. So you should avoid using that phrase in responses.
		
		At the start of the game, let the player begin as level 1 with 110 health points, 80 mana points, 15 gold, a wooden sword, a health potion, a fireball spell and a heal spell. Always give latest status of all these stats in your response.
		
Health and mana only replenishes by sleeping, having time in tavern, by eating and drinking something, drinking potions or healing spells.
		
		Killing monsters and completing quests can increase the player's level, gold and can drop items or spellbooks. There will be combat and trading systems in the game. Neutral players and allies can give quests to the player by offering a reward in return. Health points, mana points and levels will be increased throughout the game as the player completes quests, defeats enemies.

		Player's gold cannot be a negative value. For example, if player has 5 gold but a meal costs 10 gold, give alert to player, and hold players gold at the same value.
		If something is for sale, always put its price at the end of the choice.
Here's the exact format for the @placeAndTime, @story, @choices, @stats, @inventory and @spells: @placeAndTime:[{"place":"the value of this will change according to player's current area. It will be just 1 word general naming, no specific naming or proper noun. For example it can't be Azeroth or Stormwind or the town; but it can be tavern, woods, town, library, laboratory, hospital, sanatorium, school, dungeon, cave, castle, mountain, shore, cathedral, shop, home, harbor, ship, desert, island, temple, or unknown"}, {"time":"time in hour:minute format (no AM or PM, it will be 24 hour format"}] @story: [your answer about the story plot comes here] @choices: ["choice1", "choice2", "choice3"] @stats:[{"level":1, "healthPoints":"110/110", "manaPoints":"80/80" "gold":15}] @inventory:[{"name":"Wooden Sword", "type":"sword", "damage":3}, {"name":"Shield", "type":"shield", "armor":8}, {"name":"Health Potion", "type":"potion", "healing":8}] @spells:[{"name":"Fireball", "type":"destruction", "element":"fire", "manaCost":8, "damage":6}, {"name":"Heal", "type":"healing", "element":light, "manaCost":8, "healing":6}]`

		tokenCount += getTokens(prompt)

		if (tokenCount >= 4000) {
			throw new Error('Query too large')
		}

		const messages: ChatCompletionRequestMessage[] = [
			{ role: 'system', content: prompt },
			...reqMessages
		]

		const chatRequestOpts: CreateChatCompletionRequest = {
			model: 'gpt-3.5-turbo',
			messages,
			temperature: 0.7,
			stream: true
		}

		const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
			headers: {
				Authorization: `Bearer ${OPENAI_KEY}`,
				'Content-Type': 'application/json'
			},
			method: 'POST',
			body: JSON.stringify(chatRequestOpts)
		})

		if (!chatResponse.ok) {
			const err = await chatResponse.json()
			throw new Error(err)
		}

		return new Response(chatResponse.body, {
			headers: {
				'Content-Type': 'text/event-stream'
			}
		})
	} catch (err) {
		console.error('error from sv: ' + err)
		return json({ error: 'There was an error processing your request' }, { status: 500 })
	}
}
