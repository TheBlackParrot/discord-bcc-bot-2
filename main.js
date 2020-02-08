const Discord = require('discord.js');
const fs = require("fs");
const Sentencer = require("sentencer");
const request = require("request");
const os = require("os");

const settings = require("./settings.json");
var debugMode = false;
if(settings.debug) {
	debugMode = true;
}

var guild;
const client = new Discord.Client();

try {
	var muteData = require("./mutes.json");
} catch {
	var muteData = {};
}
var commandCooldowns = {};
try {
	var voiceData = require("./voice.json");
} catch {
	var voiceData = {};
}

const helloEmotes = [":wave:", ":grinning:", ":smile:", ":innocent:", ":wink:", ":blush:", ":sunglasses:", ":clap:", ":thumbsup:", ":v:", ":muscle:", ":metal:"];

String.prototype.formatTime = function () {
    var sec_num = parseInt(this, 10);

    var seconds = sec_num % 60;
    var minutes = Math.floor(sec_num / 60) % 60;
    var hours = Math.floor((sec_num / 60) / 60) % 24;
    var days = Math.floor(((sec_num / 60) / 60) / 24);

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function checkCooldown(user, cmd, cooldownPeriod) {
	let now = Date.now();

	if(user.isMod) {
		return false;
	}

	if(!(user.id in commandCooldowns)) {
		commandCooldowns[user.id] = {};
	}

	if(!(cmd in commandCooldowns[user.id])) {
		commandCooldowns[user.id][cmd] = Date.now();
		return false;
	}

	if(now - commandCooldowns[user.id][cmd] > cooldownPeriod) {
		commandCooldowns[user.id][cmd] = Date.now();
		return false;
	}

	return true;
}

function log(data) {
	console.log(data);

	if(!debugMode) {
		return;
	}

	let channel = client.channels.get(settings.channels.commands);
	channel.send(`[DEBUG] ${data}`);
}

function vcCleanup() {
	for(let memberId in voiceData) {
		let channelData = voiceData[memberId];

		if(channelData.persistent) {
			continue;
		}

		let channel = guild.channels.get(channelData.channelId);
		let textChannel = guild.channels.get(channelData.textChannelId);
		if(!channel) {
			removeVC(memberId);
			continue;
		}

		let members = channel.members.array();
		if(members.length <= 0) {
			channelData.vacancyCheck++;

			if(channelData.vacancyCheck == 1) {
				textChannel.send(":warning: This voice channel will be deleted in 2 minutes if the channel remains vacant!");
			}
			if(channelData.vacancyCheck == 2) {
				channel.delete()
					.then(function(ch) {
						textChannel.delete()
							.then(function(tch) {
								removeVC(memberId);
							});
					});
			}
		} else {
			channelData.vacancyCheck = 0;
		}
	}

	//let staff = guild.channels.get(settings.staffChannel);
	//staff.send("Ran tick for VC cleanup");
}

function removeVC(memberId) {
	delete voiceData[memberId];
	log(`[VOICE CHANNELS] vc pertaining to voiceData for ${memberId} didn't exist? removed data`);
	fs.writeFileSync("./voice.json", JSON.stringify(voiceData), "utf-8");
}

var vcCleanupInterval = setInterval(vcCleanup, 120000);

function generateVCName() {
	return Sentencer.make(`{{ adjective }} {{ ${Date.now % 2 ? "noun" : "nouns"} }}`).split(' ').map((s) => s.charAt(0).toUpperCase() + s.substring(1)).join(' ')
}

function sendServerList(channel, sorted) {
	let output = [];
	let p = Object.keys(sorted).sort(function(a, b) {return parseInt(b)-parseInt(a)});

	for(let pp in p) {
		let lines = sorted[p[pp]];
		for(let idx in lines) {
			output.push(lines[idx]);
		}
	}

	if(output.length) {
		channel.send(output);
	} else {
		channel.send("No active servers?");
	}
}

function getSomeInfo() {
	let owner = client.users.get(settings.ownerID);
	let rev;

	try {
		rev = fs.readFileSync('.git/HEAD').toString().trim();
		if(rev.indexOf(':') !== -1) {
			rev = fs.readFileSync('.git/' + rev.substring(5)).toString();
		}
	} catch(e) {
		console.error(e);
		rev = "N/A";
	}

	return [
		"```",
		`TIME/DATE    ${new Date().toString()}`,
		`SYS UPTIME   ${os.uptime().toString().formatTime()}`,
		`BOT UPTIME   ${process.uptime().toString().formatTime()}`,
		`OS           ${os.platform()} ${os.release()}`,
		`NODE.JS      ${process.version}`,
		`GIT COMMIT   ${rev.trim().substr(0, 7)}`,
		`OWNER        ${owner.tag}`,
		`DEBUG MODE   ${debugMode}`,
		"```"
	];
}

client.on('ready', function() {
	console.log(`Logged in as ${client.user.tag}!`);
	guild = client.guilds.get(settings.discord.guild);

	vcCleanup();

	let lines = getSomeInfo();
	lines.unshift(`Hello! ${helloEmotes[Math.floor(Math.random() * helloEmotes.length)]}`);

	let channel = client.channels.get(settings.channels.commands);
	channel.send(lines.join("\n"));
});

var functions = {
	"hello": function(channel, user, member, roles, isMod, msg) {
		if(channel.id !== settings.channels.commands && channel.type !== "dm") {
			return;
		}

		if(checkCooldown(user, "hello", 3000)) {
			return;
		}

		msg.reply(`Hello! ${helloEmotes[Math.floor(Math.random() * helloEmotes.length)]}`);
	},

	"role": function(channel, user, member, roles, isMod, msg) {
		if(channel.id !== settings.channels.commands && channel.type !== "dm") {
			return;
		}

		let content = msg.content;
		let parts = content.toLowerCase().split(" ").slice(1);

		if(parts.length == 0) {
			msg.reply(`You must specify a role.\n\n**Available roles:** ${settings.toggleableRoles.join(", ")}`);
			return;
		}

		let roleWanted = parts.join(" ");

		let roleList = settings.toggleableRoles.slice(0).map(function(r) {
			return r.toLowerCase();
		});

		if(roleList.indexOf(roleWanted) === -1) {
			msg.reply("This is not a toggleable role.");
			return;
		}

		let mentionableRole;
		let wantedRole;
		let guildRoles = guild.roles.array();

		for(let idx in guildRoles) {
			let r = guildRoles[idx];
			let name = r.name.toLowerCase();

			if(name == "mentionable") {
				mentionableRole = r;
			}
			if(name == roleWanted) {
				wantedRole = r;
			}
		}

		let rolesHas = roles.array();
		let hasWantedRole = false;
		let mentionableRoleCount = 0;

		for(let idx in rolesHas) {
			let h = rolesHas[idx];
			let name = h.name.toLowerCase();

			if(name == roleWanted) {
				hasWantedRole = true;
			}

			if(name.indexOf("mentionable") !== -1 && name.indexOf(" ") !== -1) {
				mentionableRoleCount++;
			}
		}

		if(hasWantedRole) {
			if(mentionableRoleCount === 1 && wantedRole.name.toLowerCase().indexOf("mentionable") !== -1) {
				member.removeRole(mentionableRole);
			}
			member.removeRole(wantedRole);
			msg.reply(`You no longer have the ${wantedRole.name} role.`);
		} else {
			if(mentionableRoleCount === 0 && wantedRole.name.toLowerCase().indexOf("mentionable") !== -1) {
				member.addRole(mentionableRole);
			}
			member.addRole(wantedRole);
			msg.reply(`You now have the ${wantedRole.name} role.`);
		}
	},

	"mute": function(channel, user, member, roles, isMod, msg) {
		if(!isMod) {
			return;
		}

		let parts = msg.content.split(" ").slice(1);
		if(parts.length < 2) {
			msg.reply("You must specify who to mute.");
			return;
		}

		//
		// TODO: move this away from cached member lists
		//

		let victim = msg.mentions.members.first();
		if(!victim) {
			victim = msg.guild.members.get(parts[0]);
			if(!victim) {
				victim = msg.guild.members.find("displayName", parts[0]);
				if(!victim) {
					victim = msg.guild.members.find("name", parts[0]);
					if(!victim) {
						msg.reply(`Unable to find mute victim. (${parts[0]})`);
						return;
					}
				}
			}
		}

		if(victim.roles.get(settings.muteRole)) {
			msg.reply(`This member is already muted. (${victim.displayName}#${victim.user.discriminator}`);
			return;
		}

		var minutes = parseInt(parts[1]);
		if(!minutes) {
			msg.reply(`Time must be in minutes. (${parts[1]})`);
			return;
		}

		victim.addRole(settings.muteRole);
		msg.reply(`${victim.displayName}#${victim.user.discriminator} has been muted for ${minutes.toLocaleString()} minutes.`);

		muteData.push({
			"member": victim.id,
			"timestampEnd": minutes == -1 ? -1 : Date.now() + (minutes*60*1000)
		});
		fs.writeFileSync("./mutes.json", JSON.stringify(muteData), "utf-8");

		var out = [];
		if(minutes != -1) {
			out.push(`You have been muted in ${guild.name} by a moderator for ${minutes.toLocaleString()} minutes.`);
		} else {
			out.push(`You have been permanently muted in ${guild.name} by a moderator.`);
		}

		victim.send(out.join("\n"));
	},

	"unmute": function(channel, user, member, roles, isMod, msg) {
		if(!isMod) {
			return;
		}

		let parts = msg.content.split(" ").slice(1);
		if(parts.length < 1) {
			msg.reply("You must specify who to unmute.");
			return;
		}

		let victim = msg.mentions.members.first();
		if(!victim) {
			victim = msg.guild.members.get(parts[0]);
			if(!victim) {
				victim = msg.guild.members.find("displayName", parts[0]);
				if(!victim) {
					victim = msg.guild.members.find("name", parts[0]);
					if(!victim) {
						msg.reply(`Unable to find mute victim. (${parts[0]})`);
						return;
					}
				}
			}
		}

		if(!victim.roles.get(settings.muteRole)) {
			msg.reply(`This member is not muted. (${victim.name}#${victim.user.discriminator}`);
			return;
		}

		victim.removeRole(settings.muteRole);
		msg.reply(`${victim.displayName}#${victim.user.discriminator} has been unmuted.`);

		for(var idx in muteData) {
			var muteRow = muteData[idx];
			if(muteRow.member == victim.id) {
				muteData.splice(idx);
				break;
			}
		}
		fs.writeFileSync("./mutes.json", JSON.stringify(muteData), "utf-8");

		victim.send(`Your mute in ${guild.name} has ended.`);
	},

	"vc": function(channel, user, member, roles, isMod, msg) {
		if(!(member.id in voiceData) && channel.id !== settings.channels.commands) {
			msg.reply(`To create your own voice channel, use \`!vc\` in <#${settings.channels.commands}>`)
			return;
		}

		if(channel.id !== settings.channels.commands && channel.id !== voiceData[member.id].textChannelId) {
			return;
		}

		const opts = "**Available options/commands**: bitrate [kbps], userLimit [users], persist [0|1], newName, delete";

		if(member.id in voiceData) {
			let voiceChannel = client.channels.get(voiceData[member.id].channelId);
			if(voiceChannel) {
				if(channel.id === settings.channels.commands) {
					msg.reply(`You already have an active voice channel. (${voiceChannel.name})`);
					return;
				} else if(channel.id === voiceData[member.id].textChannelId) {
					let parts = msg.content.split(" ").slice(1);
					if(!parts.length) {
						msg.reply(opts);
						return;
					}

					switch(parts[0].toLowerCase()) {
						case "bitrate":
							if(checkCooldown(user, "vcBitrate", 2000)) { return; }

							voiceChannel.setBitrate(parseInt(parts[1]));
							msg.reply(`Bitrate set to ${parts[1]}kbps`);
							break;

						case "userlimit":
							if(checkCooldown(user, "vcUserLimit", 2000)) { return; }

							voiceChannel.setUserLimit(parseInt(parts[1]));
							msg.reply(`User limit set to ${parts[1]} users`);
							break;

						case "persist":
							if(!isMod) {
								msg.reply("Only moderators can make their channels persist.");
								return;
							}

							if(parts[1] === "1") {
								msg.reply("This voice channel will now persist");
								voiceData[member.id].persistent = true;
							} else {
								msg.reply("This voice channel will no longer persist");
								voiceData[member.id].persistent = false;								
							}
							break;

						case "newname":
							if(checkCooldown(user, "vcName", 60000)) { return; }

							let newName = generateVCName();
							voiceChannel.setName(newName);
							let textChannel = guild.channels.get(voiceData[member.id].textChannelId);
							if(textChannel) {
								textChannel.setName(newName);
							}
							msg.reply(`Channel renamed to **${newName}**`);
							break;

						case "delete":
							voiceChannel.delete()
								.then(function(ch) {
									let textChannel = guild.channels.get(voiceData[member.id].textChannelId);
									textChannel.delete()
								});
							break;

						default:
							msg.reply(opts);
							break;
					}

					return;
				}
			}
		}

		if(checkCooldown(user, "vc", 30000)) { return; }

		let VCid = generateVCName();
		guild.createChannel(`${VCid}`, {type: "voice", parent: settings.voiceCategory, position: 0})
			.then(function(newChannel) {
				voiceData[member.id] = {
					channelId: newChannel.id,
					ownerId: member.id,
					textChannelId: undefined,
					persistent: false,
					bitrate: 64,
					vacancyCheck: 0
				};

				guild.createChannel(`${VCid}`, {type: "text", parent: settings.voiceCategory, position: 0})
					.then(function(newTChannel) {
						voiceData[member.id].textChannelId = newTChannel.id;
						fs.writeFileSync("./voice.json", JSON.stringify(voiceData), "utf-8");

						msg.reply(`Created voice channel **${VCid}** and respective text channel <#${newTChannel.id}>`);
					})
					.catch(console.error);
			})
			.catch(console.error);
	},

	"vcid": function(channel, user, member, roles, isMod, msg) {
		if(checkCooldown(user, "vcid", 1500)) {
			return;
		}

		if(channel.id !== settings.channels.commands && channel.type !== "dm") {
			return;
		}

		if(Date.now() % 2) {
			channel.send(Sentencer.make("{{ an_adjective }} {{ noun }}"));
		} else {
			channel.send(Sentencer.make("{{ adjective }} {{ nouns }}"));
		}
	},

	"servers": function(channel, user, member, roles, isMod, msg) {
		if(channel.id !== settings.channels.commands && channel.type !== "dm") {
			return;
		}

		/*
		possibilities:
			- Ace of Spades 0.75 (aos75/bas75)
			- Ace of Spades 0.76 (aos76/bas76)
		*/ 

		const availableGames = {
			blockland: "blockland",
			bl: "blockland",
			brickadia: "brickadia",
			br: "brickadia"
		};

		let parts = msg.content.toLowerCase().split(" ").splice(1);
		let wantedGame;

		if(!parts.length) {
			msg.reply(`Available games: ${[...new Set(Object.values(availableGames))].join(", ")}`);
			return;
		} else {
			if(!(parts[0] in availableGames)) {
				msg.reply(`Available games: ${[...new Set(Object.values(availableGames))].join(", ")} [parts0 not in availableGames]`);
				return;			
			}
			wantedGame = availableGames[parts[0]];
		}

		let skipLinesBL = ["END", "START", "FIELDS", ""];

		switch(wantedGame) {
			case "blockland":
				if(checkCooldown(user, "serversBL", 15000)) {
					return;
				}

				channel.startTyping();
				request("http://master2.blockland.us", function(err, response, body) {
					channel.stopTyping(true);

					if(err) {
						channel.send(`Error retrieving master server data.\n\`\`\`\n${err}\n\`\`\``);
						return;
					}
					
					let rows = body.split("\n").map(function(c) {
						return c.trim().split("\t");
					});

					let output = [];
					let sorted = {};
					
					for(let idx = 0; idx < rows.length; idx++) {
						let row = rows[idx];
						if(skipLinesBL.indexOf(row[0]) !== -1) {
							continue;
						}

						let passworded = (row[2] === "1");

						let host = row[4].substr(0, row[4].indexOf("'s"));
						let title = row[4].substr(row[4].indexOf("'s")+3);
						if(host === "") {
							host = row[4].substr(0, row[4].indexOf("'"));
							title = row[4].substr(row[4].indexOf("'")+2);
						}

						let players = `${row[5]} / ${row[6]}`;

						if(row[5] !== "0") {
							if(!(row[5] in sorted)) {
								sorted[row[5]] = [];
							}

							sorted[row[5]].push(`${passworded ? ":lock:" : ""} ${host}'s **${title}**\n:busts_in_silhouette: ${players} players online\n`);
						}
					}

					sendServerList(channel, sorted);
				});
				break;

			case "brickadia":
				if(checkCooldown(user, "serversBR", 15000)) {
					return;
				}

				channel.startTyping();

				request("https://brickadia.com/api/v1/servers", function(err, response, body) {
					channel.stopTyping(true);

					if(err) {
						channel.send(`Error retrieving master server data.\n\`\`\`\n${err}\n\`\`\``);
						return;
					}

					let data = JSON.parse(body);
					let currentGameVersion = data.currentGameVersion;
					let servers = data.servers;

					let output = [];
					let sorted = {};

					for(let idx in servers) {
						let serverData = servers[idx];

						if(serverData.version !== currentGameVersion) {
							continue;
						}

						if(serverData.playerCount <= 0) {
							continue;
						}

						let passworded = serverData.passworded;

						let host = serverData.hostName;
						let title = serverData.name;
						let players = `${serverData.playerCount} / ${serverData.playerLimit}`;

						if(!(serverData.playerCount in sorted)) {
							sorted[serverData.playerCount] = [];
						}

						sorted[serverData.playerCount].push(`${passworded ? ":lock:" : ""} ${host}'s **${title}**\n:busts_in_silhouette: ${players} players online\n`);
					}

					sendServerList(channel, sorted);
				});

				break;
		}
	},

	"staffwatch": function(channel, user, member, roles, isMod, msg) {
		if(!user.isMod) {
			return;
		}

		let parts = msg.content.split(" ").slice(1);
		if(!parts.length) {
			msg.reply("No message ID is present. (1st arg)");
			return;
		}

		if(parts.length === 1) {
			msg.reply("No raffle emote is present. (2nd arg)");
			return;
		}

		let safeEmote = parts[1].replace(/\:/g, '');

		let channels = client.channels.array();
		channel.startTyping();
		for(let idx in channels) {
			let ch = channels[idx];

			if(ch.type !== "text") {
				continue;
			}

			ch.fetchMessage(parts[0])
				.then(function(wantedMessage) {
					let out = [];
					channel.stopTyping(true);

					let reactions = wantedMessage.reactions.array();
					let wantedReaction;
					for(let ridx in reactions) {
						let r = reactions[ridx];
						let emote = r.emoji;

						if(emote.name === safeEmote) {
							// this isn't right but it's working so whatever
							wantedReaction = r;
							break;
						}
					}

					wantedReaction.fetchUsers()
						.then(function(usersCollection) {
							let users = usersCollection.array();
							//console.log(users);

							let exclude = [];
							let allowedMembers = [];

							wantedMessage.guild.fetchMembers()
								.then(function(guildMembersCollectionISuppose) {
									let eout = [];

									for(let uidx in users) {
										let skip = false;
										let u = users[uidx];
										let m;

										// hhhhhh
										let guildMembers = guildMembersCollectionISuppose.members.array();
										for(let gmidx in guildMembers) {
											let guildMember = guildMembers[gmidx];
											let guildUser = guildMember.user;

											if(guildUser.id === u.id) {
												m = guildMember;
												break;
											}
										}

										if(typeof m === "undefined") {
											log(`[SW] ${u.tag} doesn't exist?`);
											continue;
										}

										if(m.roles.has(settings.staffWatchRole)) {
											m.removeRole(settings.staffWatchRole);
											exclude.push(m);
											eout.push(`${u.tag} -- *previously Staff Watch*`);
											skip = true;
										}

										else if(m.roles.has(settings.muteRole)) {
											exclude.push(m);
											eout.push(`${u.tag} -- *muted*`);
											skip = true;
										}

										for(let kdjfs in settings.moderationRoles) {
											if(m.roles.has(settings.moderationRoles[kdjfs])) {
												exclude.push(m);
												eout.push(`${u.tag} -- *is considered a staff member*`);
												skip = true;
											}
										}

										if(!skip) {
											allowedMembers.push(m);
										}
									}
									exclude = [...new Set(exclude)];
									//channel.send(`**ALLOWED**\n${allowedMembers.join(", ")}\n\n**EXCLUDED**\n${exclude.join(", ")}`);

									let chosen = [];
									let out = [];

									for(let i = 0; i < 5; i++) {
										let wants = allowedMembers[Math.floor(Math.random() * allowedMembers.length)];
										while(chosen.indexOf(wants) != -1) {
											wants = allowedMembers[Math.floor(Math.random() * allowedMembers.length)];
										}

										chosen.push(wants);
									}

									for(cidx in chosen) {
										let theChose = chosen[cidx];
										theChose.addRole(settings.staffWatchRole);
										out.push(theChose.user.tag);
									}

									client.channels.get(settings.staffChannel).send(`**Set staff watch to:**\n${out.join("\n")}\n\n**Excluded from drawing:**\n${eout.join("\n")}`);
								})
						})
						.catch(console.error);
				})
				.catch(function(err) {});
		}
	},

	"info": function(channel, user, member, roles, isMod, msg) {
		if(checkCooldown(user, "info", 5000)) {
			return;
		}

		if(channel.id !== settings.channels.commands && channel.type !== "dm") {
			return;
		}

		let lines = getSomeInfo();
		lines.push("**Available commands**");
		let cmdlineFuncs = [];
		for(let cmd in functions) {
			if(cmd in aliases) {
				cmdlineFuncs.push(`\`!${cmd}\` *(alias of \`!${aliases[cmd]}\`)*`);
			} else {
				cmdlineFuncs.push(`\`!${cmd}\``);
			}
		}

		lines.push(cmdlineFuncs.join(" \\|\\| "));

		lines.push("\nSource code for the bot is available here: https://github.com/TheBlackParrot/discord-bcc-bot-2");

		channel.send(lines);
	},

	"debug": function(channel, user, member, roles, isMod, msg) {
		if(checkCooldown(user, "info", 1500)) {
			return;
		}

		if(channel.id !== settings.channels.commands && channel.type !== "dm") {
			return;
		}

		let owner = client.users.get(settings.ownerID);

		if(user.id !== owner.id) {
			msg.reply(`Only ${owner.tag} can use this command`);
			return;
		}

		if(debugMode) {
			debugMode = false;
			msg.reply("Debug mode now off");
		} else {
			debugMode = true;
			msg.reply("Debug mode now on");
		}
	},

	"restart": function(channel, user, member, roles, isMod, msg) {
		if(checkCooldown(user, "restart", 1500)) {
			return;
		}

		if(channel.id !== settings.channels.commands && channel.type !== "dm") {
			return;
		}

		let owner = client.users.get(settings.ownerID);

		if(user.id !== owner.id) {
			msg.reply(`Only ${owner.tag} can use this command`);
			return;
		}

		// using pm2 so this should trigger it to start it back up
		// you'd do something like https://stackoverflow.com/a/55371749 otherwise
		process.exit();
	}
}
const aliases = {
	"sw": "staffwatch",
	"help": "info",
	"cmds": "info"
}
for(let alias in aliases) {
	functions[alias] = functions[aliases[alias]];
}

function muteTick() {
	if(!muteData.length) {
		return;
	}

	let now = Date.now();
	let staff = client.channels.get(settings.staffChannel);

	for(let idx in muteData) {
		let data = muteData[idx];

		if(data.timestampEnd != -1) {
			if(now >= parseInt(data.timestampEnd)) {
				let victim = guild.members.get(data.member);

				if(victim) {
					if(victim.roles.get(settings.muteRole)) {
						victim.removeRole(settings.muteRole);
						victim.send(`Your mute in ${guild.name} has ended.`);
						staff.send(`Mute for ${victim.displayName}#${victim.user.discriminator} (${data.member}) has ended.`);
					}
				} else {
					staff.send(`Mute for ${data.member} has ended. (not present on guild)`);
				}

				log(`[MUTE] ended mute for member ID ${data.member}`);

				muteData.splice(idx, 1);
				fs.writeFileSync("./mutes.json", JSON.stringify(muteData), "utf-8");
			}
		}
	}
}
var muteTickInterval = setInterval(muteTick, 5000);

client.on('message', function(msg) {
	let channel = msg.channel;
	let user = msg.author;

	if(user.id === client.user.id) {
		return;
	}

	let content = msg.content;
	if(content[0] !== settings.commandPrefix) {
		return;
	}
	content = content.slice(1);

	let member;
	let roles;
	if(channel.type === "dm") {
		member = guild.members.get(user.id);
	} else {
		member = msg.member;
	}
	roles = member.roles;

	let isMod = false;

	for(let idx in settings.moderationRoles) {
		let mr = settings.moderationRoles[idx];

		if(roles.has(mr)) {
			isMod = true;
		}
	}

	user.isMod = isMod; // todo: use this everywhere

	let cmd = content.split(" ").slice(0, 1);
	if(cmd in functions) {
		functions[cmd](channel, user, member, roles, isMod, msg);
	}

	//msg.reply(`GUILD ID -- ${guild.id}\nMEMBER ID -- ${member.id}\nUSER ID -- ${user.id}\nCONSIDERED MOD -- ${isMod}`);
});

client.on("guildMemberAdd", function(member) {
	let now = Date.now();

	for(let idx in muteData) {
		let data = muteData[idx];

		if(data.member == member.id) {
			if(data.timestampEnd == -1 || now < parseInt(data.timestampEnd)) {
				member.addRole(settings.muteRole);
			}
		}
	}	
});

client.on("messageDelete", function(message) {
	if(message.author.id === client.user.id) {
		return;
	}

	let now = new Date();
	let timestr = [now.getHours(), now.getMinutes().toString().padStart(2, '0'), now.getSeconds().toString().padStart(2, '0')].join(":");
	let whom = [message.author.username, message.author.discriminator].join("#");
	let where = `<#${message.channel.id}>`;

	let lines = [
		`\`[${timestr}]\` User **${whom}** \`(${message.member.id})\` :x: *deleted* a message from ${where}`,
		"```",
		message.cleanContent.substr(0, 1500),
		"```"
	];

	let channel = client.channels.get(settings.channels.logs);
	channel.send(lines.join("\n"));
});

client.login(settings.discord.token);