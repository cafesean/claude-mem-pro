"use strict";var Ft=Object.create;var j=Object.defineProperty;var Pt=Object.getOwnPropertyDescriptor;var Gt=Object.getOwnPropertyNames;var Ht=Object.getPrototypeOf,jt=Object.prototype.hasOwnProperty;var Xt=(n,e)=>{for(var t in e)j(n,t,{get:e[t],enumerable:!0})},Ae=(n,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of Gt(e))!jt.call(n,r)&&r!==t&&j(n,r,{get:()=>e[r],enumerable:!(s=Pt(e,r))||s.enumerable});return n};var U=(n,e,t)=>(t=n!=null?Ft(Ht(n)):{},Ae(e||!n||!n.__esModule?j(t,"default",{value:n,enumerable:!0}):t,n)),Bt=n=>Ae(j({},"__esModule",{value:!0}),n);var ys={};Xt(ys,{generateContext:()=>Oe});module.exports=Bt(ys);var wt=U(require("path"),1),xt=require("os"),kt=require("fs");var ae=require("bun:sqlite");var T=require("path"),ne=require("os"),M=require("fs");var Ce=require("url");var D=require("fs"),Ne=require("path");var te=(o=>(o[o.DEBUG=0]="DEBUG",o[o.INFO=1]="INFO",o[o.WARN=2]="WARN",o[o.ERROR=3]="ERROR",o[o.SILENT=4]="SILENT",o))(te||{}),se=class{level=null;useColor;logFilePath=null;logFileInitialized=!1;constructor(){this.useColor=process.stdout.isTTY??!1}ensureLogFileInitialized(){if(!this.logFileInitialized){this.logFileInitialized=!0;try{let e=w.logsDir();(0,D.existsSync)(e)||(0,D.mkdirSync)(e,{recursive:!0});let t=new Date().toISOString().split("T")[0];this.logFilePath=(0,Ne.join)(e,`claude-mem-${t}.log`)}catch(e){console.error("[LOGGER] Failed to initialize log file:",e instanceof Error?e.message:String(e)),this.logFilePath=null}}}getLevel(){if(this.level===null)try{let e=w.settings();if((0,D.existsSync)(e)){let t=(0,D.readFileSync)(e,"utf-8"),r=(JSON.parse(t).CLAUDE_MEM_LOG_LEVEL||"INFO").toUpperCase();this.level=te[r]??1}else this.level=1}catch(e){console.error("[LOGGER] Failed to load log level from settings:",e instanceof Error?e.message:String(e)),this.level=1}return this.level}correlationId(e,t){return`obs-${e}-${t}`}sessionId(e){return`session-${e}`}formatData(e){if(e==null)return"";if(typeof e=="string")return e;if(typeof e=="number"||typeof e=="boolean")return e.toString();if(typeof e=="object"){if(e instanceof Error)return this.getLevel()===0?`${e.message}
${e.stack}`:e.message;if(Array.isArray(e))return`[${e.length} items]`;let t=Object.keys(e);return t.length===0?"{}":t.length<=3?JSON.stringify(e):`{${t.length} keys: ${t.slice(0,3).join(", ")}...}`}return String(e)}formatTool(e,t){if(!t)return e;let s=t;if(typeof t=="string")try{s=JSON.parse(t)}catch{s=t}if(e==="Bash"&&s.command)return`${e}(${s.command})`;if(s.file_path)return`${e}(${s.file_path})`;if(s.notebook_path)return`${e}(${s.notebook_path})`;if(e==="Glob"&&s.pattern)return`${e}(${s.pattern})`;if(e==="Grep"&&s.pattern)return`${e}(${s.pattern})`;if(s.url)return`${e}(${s.url})`;if(s.query)return`${e}(${s.query})`;if(e==="Task"){if(s.subagent_type)return`${e}(${s.subagent_type})`;if(s.description)return`${e}(${s.description})`}return e==="Skill"&&s.skill?`${e}(${s.skill})`:e==="LSP"&&s.operation?`${e}(${s.operation})`:e}formatTimestamp(e){let t=e.getFullYear(),s=String(e.getMonth()+1).padStart(2,"0"),r=String(e.getDate()).padStart(2,"0"),o=String(e.getHours()).padStart(2,"0"),i=String(e.getMinutes()).padStart(2,"0"),a=String(e.getSeconds()).padStart(2,"0"),d=String(e.getMilliseconds()).padStart(3,"0");return`${t}-${s}-${r} ${o}:${i}:${a}.${d}`}log(e,t,s,r,o){if(e<this.getLevel())return;this.ensureLogFileInitialized();let i=this.formatTimestamp(new Date),a=te[e].padEnd(5),d=t.padEnd(6),_="";r?.correlationId?_=`[${r.correlationId}] `:r?.sessionId&&(_=`[session-${r.sessionId}] `);let u="";if(o!=null)if(o instanceof Error)u=this.getLevel()===0?`
${o.message}
${o.stack}`:` ${o.message}`;else if(this.getLevel()===0&&typeof o=="object")try{u=`
`+JSON.stringify(o,null,2)}catch{u=" "+this.formatData(o)}else u=" "+this.formatData(o);let g="";if(r){let{sessionId:E,memorySessionId:f,correlationId:b,...m}=r;Object.keys(m).length>0&&(g=` {${Object.entries(m).map(([h,S])=>`${h}=${S}`).join(", ")}}`)}let p=`[${i}] [${a}] [${d}] ${_}${s}${g}${u}`;if(this.logFilePath)try{(0,D.appendFileSync)(this.logFilePath,p+`
`,"utf8")}catch(E){process.stderr.write(`[LOGGER] Failed to write to log file: ${E instanceof Error?E.message:String(E)}
`)}else process.stderr.write(p+`
`)}debug(e,t,s,r){this.log(0,e,t,s,r)}info(e,t,s,r){this.log(1,e,t,s,r)}warn(e,t,s,r){this.log(2,e,t,s,r)}error(e,t,s,r){this.log(3,e,t,s,r)}dataIn(e,t,s,r){this.info(e,`\u2192 ${t}`,s,r)}dataOut(e,t,s,r){this.info(e,`\u2190 ${t}`,s,r)}success(e,t,s,r){this.info(e,`\u2713 ${t}`,s,r)}failure(e,t,s,r){this.error(e,`\u2717 ${t}`,s,r)}timing(e,t,s,r){this.info(e,`\u23F1 ${t}`,r,{duration:`${s}ms`})}happyPathError(e,t,s,r,o=""){let _=((new Error().stack||"").split(`
`)[2]||"").match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/),u=_?`${_[1].split("/").pop()}:${_[2]}`:"unknown",g={...s,location:u};return this.warn(e,`[HAPPY-PATH] ${t}`,g,r),o}},l=new se;var es={};function Wt(){return typeof __dirname<"u"?__dirname:(0,T.dirname)((0,Ce.fileURLToPath)(es.url))}var Vt=Wt();function qt(){if(process.env.CLAUDE_MEM_DATA_DIR)return process.env.CLAUDE_MEM_DATA_DIR;let n=(0,T.join)((0,ne.homedir)(),".claude-mem"),e=(0,T.join)(n,"settings.json");try{if((0,M.existsSync)(e)){let t=JSON.parse((0,M.readFileSync)(e,"utf-8")),s=t.env??t;if(s.CLAUDE_MEM_DATA_DIR)return s.CLAUDE_MEM_DATA_DIR}}catch{}return n}var O=qt(),y=process.env.CLAUDE_CONFIG_DIR||(0,T.join)((0,ne.homedir)(),".claude"),$s=(0,T.join)(y,"plugins","marketplaces","cafesean"),Yt=(0,T.join)(O,"archives"),Kt=(0,T.join)(O,"logs"),Jt=(0,T.join)(O,"trash"),Qt=(0,T.join)(O,"backups"),zt=(0,T.join)(O,"modes"),Fs=(0,T.join)(O,"settings.json"),Ie=(0,T.join)(O,"claude-mem.db"),Zt=(0,T.join)(O,"vector-db"),Le=(0,T.join)(O,"observer-sessions"),re=(0,T.basename)(Le),Ps=(0,T.join)(y,"settings.json"),Gs=(0,T.join)(y,"commands"),Hs=(0,T.join)(y,"CLAUDE.md");function De(n){(0,M.mkdirSync)(n,{recursive:!0})}function Me(){return(0,T.join)(Vt,"..")}var w={dataDir:()=>O,workerPid:()=>(0,T.join)(O,"worker.pid"),serverBetaPid:()=>(0,T.join)(O,".server-beta.pid"),serverBetaPort:()=>(0,T.join)(O,".server-beta.port"),serverBetaRuntime:()=>(0,T.join)(O,".server-beta.runtime.json"),settings:()=>(0,T.join)(O,"settings.json"),database:()=>(0,T.join)(O,"claude-mem.db"),chroma:()=>(0,T.join)(O,"chroma"),combinedCerts:()=>(0,T.join)(O,"combined_certs.pem"),transcriptsConfig:()=>(0,T.join)(O,"transcript-watch.json"),transcriptsState:()=>(0,T.join)(O,"transcript-watch-state.json"),corpora:()=>(0,T.join)(O,"corpora"),supervisorRegistry:()=>(0,T.join)(O,"supervisor.json"),envFile:()=>(0,T.join)(O,".env"),logsDir:()=>Kt,archives:()=>Yt,trash:()=>Jt,backups:()=>Qt,modes:()=>zt,vectorDb:()=>Zt,observerSessions:()=>Le};var xe=require("crypto");var ve=require("os"),Ue=U(require("path"),1);var B=require("fs"),X=U(require("path"),1),x={isWorktree:!1,worktreeName:null,parentRepoPath:null,parentProjectName:null};function ye(n){let e=X.default.join(n,".git"),t;try{t=(0,B.statSync)(e)}catch(u){return u instanceof Error&&u.code!=="ENOENT"&&console.warn("[worktree] Unexpected error checking .git:",u),x}if(!t.isFile())return x;let s;try{s=(0,B.readFileSync)(e,"utf-8").trim()}catch(u){return console.warn("[worktree] Failed to read .git file:",u instanceof Error?u.message:String(u)),x}let r=s.match(/^gitdir:\s*(.+)$/);if(!r)return x;let i=r[1].match(/^(.+)[/\\]\.git[/\\]worktrees[/\\]([^/\\]+)$/);if(!i)return x;let a=i[1],d=X.default.basename(n),_=X.default.basename(a);return{isWorktree:!0,worktreeName:d,parentRepoPath:a,parentProjectName:_}}function we(n){return n==="~"||n.startsWith("~/")?n.replace(/^~/,(0,ve.homedir)()):n}function ts(n){if(!n||n.trim()==="")return l.warn("PROJECT_NAME","Empty cwd provided, using fallback",{cwd:n}),"unknown-project";let e=we(n),t=Ue.default.basename(e);if(t===""){if(process.platform==="win32"){let r=n.match(/^([A-Z]):\\/i);if(r){let i=`drive-${r[1].toUpperCase()}`;return l.info("PROJECT_NAME","Drive root detected",{cwd:n,projectName:i}),i}}return l.warn("PROJECT_NAME","Root directory detected, using fallback",{cwd:n}),"unknown-project"}return t}function oe(n){let e=ts(n);if(!n)return{primary:e,parent:null,isWorktree:!1,allProjects:[e]};let t=we(n),s=ye(t);if(s.isWorktree&&s.parentProjectName){let r=`${s.parentProjectName}/${e}`;return{primary:r,parent:s.parentProjectName,isWorktree:!0,allProjects:[s.parentProjectName,r]}}return{primary:e,parent:null,isWorktree:!1,allProjects:[e]}}function W(n,e,t){return(0,xe.createHash)("sha256").update([n||"",e||"",t||""].join("\0")).digest("hex").slice(0,16)}function ie(n){if(!n)return[];try{let e=JSON.parse(n);return Array.isArray(e)?e:[String(e)]}catch{return[n]}}var N="claude";function ss(n){return n.trim().toLowerCase().replace(/\s+/g,"-")}function v(n){if(!n)return N;let e=ss(n);return e?e==="transcript"||e.includes("codex")?"codex":e.includes("cursor")?"cursor":e.includes("claude")?"claude":e:N}function ke(n){let e=["claude","codex","cursor"];return[...n].sort((t,s)=>{let r=e.indexOf(t),o=e.indexOf(s);return r!==-1||o!==-1?r===-1?1:o===-1?-1:r-o:t.localeCompare(s)})}function ns(n,e){return{customTitle:n,platformSource:e?v(e):void 0}}var V=class{db;constructor(e=Ie){e instanceof ae.Database?this.db=e:(e!==":memory:"&&De(O),this.db=new ae.Database(e),this.db.run("PRAGMA journal_mode = WAL"),this.db.run("PRAGMA synchronous = NORMAL"),this.db.run("PRAGMA foreign_keys = ON"),this.db.run("PRAGMA journal_size_limit = 4194304")),this.initializeSchema(),this.ensureWorkerPortColumn(),this.ensurePromptTrackingColumns(),this.removeSessionSummariesUniqueConstraint(),this.addObservationHierarchicalFields(),this.makeObservationsTextNullable(),this.createUserPromptsTable(),this.ensureDiscoveryTokensColumn(),this.createPendingMessagesTable(),this.renameSessionIdColumns(),this.repairSessionIdColumnRename(),this.addFailedAtEpochColumn(),this.addOnUpdateCascadeToForeignKeys(),this.addObservationContentHashColumn(),this.addSessionCustomTitleColumn(),this.addSessionPlatformSourceColumn(),this.addObservationModelColumns(),this.ensureMergedIntoProjectColumns(),this.addObservationSubagentColumns(),this.addObservationsUniqueContentHashIndex(),this.addObservationsMetadataColumn(),this.dropDeadPendingMessagesColumns(),this.ensurePendingMessagesToolUseIdColumn(),this.dropWorkerPidColumn()}dropWorkerPidColumn(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(32),s=this.db.query("PRAGMA table_info(pending_messages)").all().some(r=>r.name==="worker_pid");if(!(e&&!s)){if(s)try{this.db.run("DROP INDEX IF EXISTS idx_pending_messages_worker_pid"),this.db.run("ALTER TABLE pending_messages DROP COLUMN worker_pid"),l.debug("DB","Dropped worker_pid column and its index from pending_messages")}catch(r){l.warn("DB","Failed to drop worker_pid column from pending_messages",{},r instanceof Error?r:new Error(String(r)));return}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(32,new Date().toISOString())}}dropDeadPendingMessagesColumns(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(31),t=this.db.query("PRAGMA table_info(pending_messages)").all(),s=new Set(t.map(i=>i.name)),o=["retry_count","failed_at_epoch","completed_at_epoch"].filter(i=>s.has(i));if(!(e&&o.length===0)){if(o.length>0){this.db.run("BEGIN TRANSACTION");try{this.db.run("DELETE FROM pending_messages WHERE status NOT IN ('pending', 'processing')");for(let i of o)this.db.run(`ALTER TABLE pending_messages DROP COLUMN ${i}`),l.debug("DB",`Dropped dead column ${i} from pending_messages`);e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(31,new Date().toISOString()),this.db.run("COMMIT")}catch(i){this.db.run("ROLLBACK"),l.warn("DB","Failed to drop dead columns from pending_messages",{},i instanceof Error?i:new Error(String(i)));return}return}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(31,new Date().toISOString())}}initializeSchema(){this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `),this.db.run(`
      CREATE TABLE IF NOT EXISTS sdk_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT UNIQUE NOT NULL,
        memory_session_id TEXT UNIQUE,
        project TEXT NOT NULL,
        platform_source TEXT NOT NULL DEFAULT 'claude',
        user_prompt TEXT,
        started_at TEXT NOT NULL,
        started_at_epoch INTEGER NOT NULL,
        completed_at TEXT,
        completed_at_epoch INTEGER,
        status TEXT CHECK(status IN ('active', 'completed', 'failed')) NOT NULL DEFAULT 'active'
      );

      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_claude_id ON sdk_sessions(content_session_id);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_sdk_id ON sdk_sessions(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_project ON sdk_sessions(project);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_status ON sdk_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_started ON sdk_sessions(started_at_epoch DESC);

      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project);
      CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
      CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at_epoch DESC);

      CREATE TABLE IF NOT EXISTS session_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT UNIQUE NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(4,new Date().toISOString())}ensureWorkerPortColumn(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(s=>s.name==="worker_port")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN worker_port INTEGER"),l.debug("DB","Added worker_port column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(5,new Date().toISOString())}ensurePromptTrackingColumns(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(a=>a.name==="prompt_counter")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN prompt_counter INTEGER DEFAULT 0"),l.debug("DB","Added prompt_counter column to sdk_sessions table")),this.db.query("PRAGMA table_info(observations)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE observations ADD COLUMN prompt_number INTEGER"),l.debug("DB","Added prompt_number column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN prompt_number INTEGER"),l.debug("DB","Added prompt_number column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(6,new Date().toISOString())}removeSessionSummariesUniqueConstraint(){if(!this.db.query("PRAGMA index_list(session_summaries)").all().some(s=>s.unique===1&&s.origin!=="pk")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString());return}l.debug("DB","Removing UNIQUE constraint from session_summaries.memory_session_id"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS session_summaries_new"),this.db.run(`
      CREATE TABLE session_summaries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        prompt_number INTEGER,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      )
    `),this.db.run(`
      INSERT INTO session_summaries_new
      SELECT id, memory_session_id, project, request, investigated, learned,
             completed, next_steps, files_read, files_edited, notes,
             prompt_number, created_at, created_at_epoch
      FROM session_summaries
    `),this.db.run("DROP TABLE session_summaries"),this.db.run("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.run(`
      CREATE INDEX idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString()),l.debug("DB","Successfully removed UNIQUE constraint from session_summaries.memory_session_id")}addObservationHierarchicalFields(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(8))return;if(this.db.query("PRAGMA table_info(observations)").all().some(r=>r.name==="title")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString());return}l.debug("DB","Adding hierarchical fields to observations table"),this.db.run(`
      ALTER TABLE observations ADD COLUMN title TEXT;
      ALTER TABLE observations ADD COLUMN subtitle TEXT;
      ALTER TABLE observations ADD COLUMN facts TEXT;
      ALTER TABLE observations ADD COLUMN narrative TEXT;
      ALTER TABLE observations ADD COLUMN concepts TEXT;
      ALTER TABLE observations ADD COLUMN files_read TEXT;
      ALTER TABLE observations ADD COLUMN files_modified TEXT;
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString()),l.debug("DB","Successfully added hierarchical fields to observations table")}makeObservationsTextNullable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(9))return;let s=this.db.query("PRAGMA table_info(observations)").all().find(r=>r.name==="text");if(!s||s.notnull===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString());return}l.debug("DB","Making observations.text nullable"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS observations_new"),this.db.run(`
      CREATE TABLE observations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT,
        type TEXT NOT NULL,
        title TEXT,
        subtitle TEXT,
        facts TEXT,
        narrative TEXT,
        concepts TEXT,
        files_read TEXT,
        files_modified TEXT,
        prompt_number INTEGER,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      )
    `),this.db.run(`
      INSERT INTO observations_new
      SELECT id, memory_session_id, project, text, type, title, subtitle, facts,
             narrative, concepts, files_read, files_modified, prompt_number,
             created_at, created_at_epoch
      FROM observations
    `),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(`
      CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX idx_observations_project ON observations(project);
      CREATE INDEX idx_observations_type ON observations(type);
      CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
    `),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString()),l.debug("DB","Successfully made observations.text nullable")}createUserPromptsTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(10))return;if(this.db.query("PRAGMA table_info(user_prompts)").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString());return}l.debug("DB","Creating user_prompts table with FTS5 support"),this.db.run("BEGIN TRANSACTION"),this.db.run(`
      CREATE TABLE user_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT NOT NULL,
        prompt_number INTEGER NOT NULL,
        prompt_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(content_session_id) REFERENCES sdk_sessions(content_session_id) ON DELETE CASCADE
      );

      CREATE INDEX idx_user_prompts_claude_session ON user_prompts(content_session_id);
      CREATE INDEX idx_user_prompts_created ON user_prompts(created_at_epoch DESC);
      CREATE INDEX idx_user_prompts_prompt_number ON user_prompts(prompt_number);
      CREATE INDEX idx_user_prompts_lookup ON user_prompts(content_session_id, prompt_number);
    `);let s=`
      CREATE VIRTUAL TABLE user_prompts_fts USING fts5(
        prompt_text,
        content='user_prompts',
        content_rowid='id'
      );
    `,r=`
      CREATE TRIGGER user_prompts_ai AFTER INSERT ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(rowid, prompt_text)
        VALUES (new.id, new.prompt_text);
      END;

      CREATE TRIGGER user_prompts_ad AFTER DELETE ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
        VALUES('delete', old.id, old.prompt_text);
      END;

      CREATE TRIGGER user_prompts_au AFTER UPDATE ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
        VALUES('delete', old.id, old.prompt_text);
        INSERT INTO user_prompts_fts(rowid, prompt_text)
        VALUES (new.id, new.prompt_text);
      END;
    `;try{this.db.run(s),this.db.run(r)}catch(o){o instanceof Error?l.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},o):l.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},new Error(String(o))),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),l.debug("DB","Created user_prompts table (without FTS5)");return}this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),l.debug("DB","Successfully created user_prompts table")}ensureDiscoveryTokensColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(11))return;this.db.query("PRAGMA table_info(observations)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),l.debug("DB","Added discovery_tokens column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),l.debug("DB","Added discovery_tokens column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(11,new Date().toISOString())}createPendingMessagesTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(16))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString());return}l.debug("DB","Creating pending_messages table"),this.db.run(`
      CREATE TABLE pending_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_db_id INTEGER NOT NULL,
        content_session_id TEXT NOT NULL,
        message_type TEXT NOT NULL CHECK(message_type IN ('observation', 'summarize')),
        tool_name TEXT,
        tool_input TEXT,
        tool_response TEXT,
        cwd TEXT,
        last_user_message TEXT,
        last_assistant_message TEXT,
        prompt_number INTEGER,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing')),
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY (session_db_id) REFERENCES sdk_sessions(id) ON DELETE CASCADE
      )
    `),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_session ON pending_messages(session_db_id)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_status ON pending_messages(status)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_claude_session ON pending_messages(content_session_id)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString()),l.debug("DB","pending_messages table created successfully")}renameSessionIdColumns(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(17))return;l.debug("DB","Checking session ID columns for semantic clarity rename");let t=0,s=(r,o,i)=>{let a=this.db.query(`PRAGMA table_info(${r})`).all(),d=a.some(u=>u.name===o);return a.some(u=>u.name===i)?!1:d?(this.db.run(`ALTER TABLE ${r} RENAME COLUMN ${o} TO ${i}`),l.debug("DB",`Renamed ${r}.${o} to ${i}`),!0):(l.warn("DB",`Column ${o} not found in ${r}, skipping rename`),!1)};s("sdk_sessions","claude_session_id","content_session_id")&&t++,s("sdk_sessions","sdk_session_id","memory_session_id")&&t++,s("pending_messages","claude_session_id","content_session_id")&&t++,s("observations","sdk_session_id","memory_session_id")&&t++,s("session_summaries","sdk_session_id","memory_session_id")&&t++,s("user_prompts","claude_session_id","content_session_id")&&t++,this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(17,new Date().toISOString()),t>0?l.debug("DB",`Successfully renamed ${t} session ID columns`):l.debug("DB","No session ID column renames needed (already up to date)")}repairSessionIdColumnRename(){this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(19)||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(19,new Date().toISOString())}addFailedAtEpochColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(20))return;this.db.query("PRAGMA table_info(pending_messages)").all().some(r=>r.name==="failed_at_epoch")||(this.db.run("ALTER TABLE pending_messages ADD COLUMN failed_at_epoch INTEGER"),l.debug("DB","Added failed_at_epoch column to pending_messages table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(20,new Date().toISOString())}addOnUpdateCascadeToForeignKeys(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(21))return;l.debug("DB","Adding ON UPDATE CASCADE to FK constraints on observations and session_summaries"),this.db.run("PRAGMA foreign_keys = OFF"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TRIGGER IF EXISTS observations_ai"),this.db.run("DROP TRIGGER IF EXISTS observations_ad"),this.db.run("DROP TRIGGER IF EXISTS observations_au"),this.db.run("DROP TABLE IF EXISTS observations_new");let s=this.db.query("PRAGMA table_info(observations)").all().some(f=>f.name==="metadata"),r=s?`,
        metadata TEXT`:"",o=s?", metadata":"",i=`
      CREATE TABLE observations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT,
        type TEXT NOT NULL,
        title TEXT,
        subtitle TEXT,
        facts TEXT,
        narrative TEXT,
        concepts TEXT,
        files_read TEXT,
        files_modified TEXT,
        prompt_number INTEGER,
        discovery_tokens INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL${r},
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `,a=`
      INSERT INTO observations_new
      SELECT id, memory_session_id, project, text, type, title, subtitle, facts,
             narrative, concepts, files_read, files_modified, prompt_number,
             discovery_tokens, created_at, created_at_epoch${o}
      FROM observations
    `,d=`
      CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX idx_observations_project ON observations(project);
      CREATE INDEX idx_observations_type ON observations(type);
      CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
    `,_=`
      CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
        INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
      END;

      CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
      END;

      CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
        INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
      END;
    `;this.db.run("DROP TRIGGER IF EXISTS session_summaries_ai"),this.db.run("DROP TRIGGER IF EXISTS session_summaries_ad"),this.db.run("DROP TRIGGER IF EXISTS session_summaries_au"),this.db.run("DROP TABLE IF EXISTS session_summaries_new");let u=`
      CREATE TABLE session_summaries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        prompt_number INTEGER,
        discovery_tokens INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `,g=`
      INSERT INTO session_summaries_new
      SELECT id, memory_session_id, project, request, investigated, learned,
             completed, next_steps, files_read, files_edited, notes,
             prompt_number, discovery_tokens, created_at, created_at_epoch
      FROM session_summaries
    `,p=`
      CREATE INDEX idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `,E=`
      CREATE TRIGGER IF NOT EXISTS session_summaries_ai AFTER INSERT ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
      END;

      CREATE TRIGGER IF NOT EXISTS session_summaries_ad AFTER DELETE ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
      END;

      CREATE TRIGGER IF NOT EXISTS session_summaries_au AFTER UPDATE ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
        INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
      END;
    `;try{this.recreateObservationsWithCascade(i,a,d,_),this.recreateSessionSummariesWithCascade(u,g,p,E),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(21,new Date().toISOString()),this.db.run("COMMIT"),this.db.run("PRAGMA foreign_keys = ON"),l.debug("DB","Successfully added ON UPDATE CASCADE to FK constraints")}catch(f){throw this.db.run("ROLLBACK"),this.db.run("PRAGMA foreign_keys = ON"),f instanceof Error?f:new Error(String(f))}}recreateObservationsWithCascade(e,t,s,r){this.db.run(e),this.db.run(t),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(s),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'").all().length>0&&this.db.run(r)}recreateSessionSummariesWithCascade(e,t,s,r){this.db.run(e),this.db.run(t),this.db.run("DROP TABLE session_summaries"),this.db.run("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.run(s),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_summaries_fts'").all().length>0&&this.db.run(r)}addObservationContentHashColumn(){if(this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="content_hash")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString());return}this.db.run("ALTER TABLE observations ADD COLUMN content_hash TEXT"),this.db.run("UPDATE observations SET content_hash = substr(hex(randomblob(8)), 1, 16) WHERE content_hash IS NULL"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_content_hash ON observations(content_hash, created_at_epoch)"),l.debug("DB","Added content_hash column to observations table with backfill and index"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString())}addSessionCustomTitleColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(23))return;this.db.query("PRAGMA table_info(sdk_sessions)").all().some(r=>r.name==="custom_title")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN custom_title TEXT"),l.debug("DB","Added custom_title column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(23,new Date().toISOString())}addSessionPlatformSourceColumn(){let t=this.db.query("PRAGMA table_info(sdk_sessions)").all().some(i=>i.name==="platform_source"),r=this.db.query("PRAGMA index_list(sdk_sessions)").all().some(i=>i.name==="idx_sdk_sessions_platform_source");this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(24)&&t&&r||(t||(this.db.run(`ALTER TABLE sdk_sessions ADD COLUMN platform_source TEXT NOT NULL DEFAULT '${N}'`),l.debug("DB","Added platform_source column to sdk_sessions table")),this.db.run(`
      UPDATE sdk_sessions
      SET platform_source = '${N}'
      WHERE platform_source IS NULL OR platform_source = ''
    `),r||this.db.run("CREATE INDEX IF NOT EXISTS idx_sdk_sessions_platform_source ON sdk_sessions(platform_source)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(24,new Date().toISOString()))}addObservationModelColumns(){let e=this.db.query("PRAGMA table_info(observations)").all(),t=e.some(r=>r.name==="generated_by_model"),s=e.some(r=>r.name==="relevance_count");t&&s||(t||this.db.run("ALTER TABLE observations ADD COLUMN generated_by_model TEXT"),s||this.db.run("ALTER TABLE observations ADD COLUMN relevance_count INTEGER DEFAULT 0"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(26,new Date().toISOString()))}ensureMergedIntoProjectColumns(){this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="merged_into_project")||this.db.run("ALTER TABLE observations ADD COLUMN merged_into_project TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_merged_into ON observations(merged_into_project)"),this.db.query("PRAGMA table_info(session_summaries)").all().some(s=>s.name==="merged_into_project")||this.db.run("ALTER TABLE session_summaries ADD COLUMN merged_into_project TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_summaries_merged_into ON session_summaries(merged_into_project)")}addObservationSubagentColumns(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(27),t=this.db.query("PRAGMA table_info(observations)").all(),s=t.some(i=>i.name==="agent_type"),r=t.some(i=>i.name==="agent_id");s||this.db.run("ALTER TABLE observations ADD COLUMN agent_type TEXT"),r||this.db.run("ALTER TABLE observations ADD COLUMN agent_id TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_agent_type ON observations(agent_type)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_agent_id ON observations(agent_id)");let o=this.db.query("PRAGMA table_info(pending_messages)").all();if(o.length>0){let i=o.some(d=>d.name==="agent_type"),a=o.some(d=>d.name==="agent_id");i||this.db.run("ALTER TABLE pending_messages ADD COLUMN agent_type TEXT"),a||this.db.run("ALTER TABLE pending_messages ADD COLUMN agent_id TEXT")}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(27,new Date().toISOString())}ensurePendingMessagesToolUseIdColumn(){if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(28,new Date().toISOString());return}this.db.query("PRAGMA table_info(pending_messages)").all().some(r=>r.name==="tool_use_id")||this.db.run("ALTER TABLE pending_messages ADD COLUMN tool_use_id TEXT"),this.db.run("BEGIN TRANSACTION");try{this.db.run(`
        DELETE FROM pending_messages
         WHERE id IN (
           SELECT id
             FROM (
               SELECT id,
                      ROW_NUMBER() OVER (
                        PARTITION BY content_session_id, tool_use_id
                        ORDER BY CASE status
                          WHEN 'processing' THEN 0
                          WHEN 'pending' THEN 1
                          ELSE 2
                        END, id
                      ) AS duplicate_rank
                 FROM pending_messages
                WHERE tool_use_id IS NOT NULL
             )
            WHERE duplicate_rank > 1
           )
      `),this.db.run(`
        -- tool_use_id is optional for summaries and legacy rows; enforce de-dupe
        -- only for rows that came from a concrete tool-use event.
        CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_session_tool
        ON pending_messages(content_session_id, tool_use_id)
        WHERE tool_use_id IS NOT NULL
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(28,new Date().toISOString()),this.db.run("COMMIT")}catch(r){throw this.db.run("ROLLBACK"),r}}addObservationsUniqueContentHashIndex(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(29))return;let t=this.db.query("PRAGMA table_info(observations)").all(),s=t.some(o=>o.name==="memory_session_id"),r=t.some(o=>o.name==="content_hash");if(!s||!r){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(29,new Date().toISOString());return}this.db.run("BEGIN TRANSACTION");try{this.db.run(`
        DELETE FROM observations
         WHERE id NOT IN (
           SELECT MIN(id) FROM observations
            GROUP BY memory_session_id, content_hash
         )
      `),this.db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS ux_observations_session_hash
        ON observations(memory_session_id, content_hash)
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(29,new Date().toISOString()),this.db.run("COMMIT")}catch(o){throw this.db.run("ROLLBACK"),o}}addObservationsMetadataColumn(){this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="metadata")||(this.db.run("ALTER TABLE observations ADD COLUMN metadata TEXT"),l.debug("DB","Added metadata column to observations table (#2116)")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(30,new Date().toISOString())}updateMemorySessionId(e,t){this.db.prepare(`
      UPDATE sdk_sessions
      SET memory_session_id = ?
      WHERE id = ?
    `).run(t,e)}markSessionCompleted(e){let t=Date.now(),s=new Date(t).toISOString();this.db.prepare(`
      UPDATE sdk_sessions
      SET status = 'completed', completed_at = ?, completed_at_epoch = ?
      WHERE id = ?
    `).run(s,t,e)}ensureMemorySessionIdRegistered(e,t){let s=this.db.prepare(`
      SELECT id, memory_session_id FROM sdk_sessions WHERE id = ?
    `).get(e);if(!s)throw new Error(`Session ${e} not found in sdk_sessions`);s.memory_session_id!==t&&(this.db.prepare(`
        UPDATE sdk_sessions SET memory_session_id = ? WHERE id = ?
      `).run(t,e),l.info("DB","Registered memory_session_id before storage (FK fix)",{sessionDbId:e,oldId:s.memory_session_id,newId:t}))}getRecentSummaries(e,t=10){return this.db.prepare(`
      SELECT
        request, investigated, learned, completed, next_steps,
        files_read, files_edited, notes, prompt_number, created_at
      FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getRecentSummariesWithSessionInfo(e,t=3){return this.db.prepare(`
      SELECT
        memory_session_id, request, learned, completed, next_steps,
        prompt_number, created_at
      FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getRecentObservations(e,t=20){return this.db.prepare(`
      SELECT type, text, prompt_number, created_at
      FROM observations
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getAllRecentObservations(e=100){return this.db.prepare(`
      SELECT
        o.id,
        o.type,
        o.title,
        o.subtitle,
        o.text,
        o.project,
        COALESCE(s.platform_source, '${N}') as platform_source,
        o.prompt_number,
        o.created_at,
        o.created_at_epoch
      FROM observations o
      LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
      ORDER BY o.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllRecentSummaries(e=50){return this.db.prepare(`
      SELECT
        ss.id,
        ss.request,
        ss.investigated,
        ss.learned,
        ss.completed,
        ss.next_steps,
        ss.files_read,
        ss.files_edited,
        ss.notes,
        ss.project,
        COALESCE(s.platform_source, '${N}') as platform_source,
        ss.prompt_number,
        ss.created_at,
        ss.created_at_epoch
      FROM session_summaries ss
      LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
      ORDER BY ss.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllRecentUserPrompts(e=100){return this.db.prepare(`
      SELECT
        up.id,
        up.content_session_id,
        s.project,
        COALESCE(s.platform_source, '${N}') as platform_source,
        up.prompt_number,
        up.prompt_text,
        up.created_at,
        up.created_at_epoch
      FROM user_prompts up
      LEFT JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      ORDER BY up.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllProjects(e){let t=e?v(e):void 0,s=`
      SELECT DISTINCT project
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
        AND project != ?
    `,r=[re];return t&&(s+=" AND COALESCE(platform_source, ?) = ?",r.push(N,t)),s+=" ORDER BY project ASC",this.db.prepare(s).all(...r).map(i=>i.project)}getProjectCatalog(){let e=this.db.prepare(`
      SELECT
        COALESCE(platform_source, '${N}') as platform_source,
        project,
        MAX(started_at_epoch) as latest_epoch
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
        AND project != ?
      GROUP BY COALESCE(platform_source, '${N}'), project
      ORDER BY latest_epoch DESC
    `).all(re),t=[],s=new Set,r={};for(let i of e){let a=v(i.platform_source);r[a]||(r[a]=[]),r[a].includes(i.project)||r[a].push(i.project),s.has(i.project)||(s.add(i.project),t.push(i.project))}let o=ke(Object.keys(r));return{projects:t,sources:o,projectsBySource:Object.fromEntries(o.map(i=>[i,r[i]||[]]))}}getLatestUserPrompt(e){return this.db.prepare(`
      SELECT
        up.*,
        s.memory_session_id,
        s.project,
        COALESCE(s.platform_source, '${N}') as platform_source
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.content_session_id = ?
      ORDER BY up.created_at_epoch DESC
      LIMIT 1
    `).get(e)}getRecentSessionsWithStatus(e,t=3){return this.db.prepare(`
      SELECT * FROM (
        SELECT
          s.memory_session_id,
          s.status,
          s.started_at,
          s.started_at_epoch,
          s.user_prompt,
          CASE WHEN sum.memory_session_id IS NOT NULL THEN 1 ELSE 0 END as has_summary
        FROM sdk_sessions s
        LEFT JOIN session_summaries sum ON s.memory_session_id = sum.memory_session_id
        WHERE s.project = ? AND s.memory_session_id IS NOT NULL
        GROUP BY s.memory_session_id
        ORDER BY s.started_at_epoch DESC
        LIMIT ?
      )
      ORDER BY started_at_epoch ASC
    `).all(e,t)}getObservationsForSession(e){return this.db.prepare(`
      SELECT title, subtitle, type, prompt_number
      FROM observations
      WHERE memory_session_id = ?
      ORDER BY created_at_epoch ASC
    `).all(e)}getObservationById(e){return this.db.prepare(`
      SELECT *
      FROM observations
      WHERE id = ?
    `).get(e)||null}getObservationsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:r,project:o,type:i,concepts:a,files:d}=t,_=s==="relevance",u=_?"":`ORDER BY created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,g=r?`LIMIT ${r}`:"",p=e.map(()=>"?").join(","),E=[...e],f=[];if(o&&(f.push("project = ?"),E.push(o)),i)if(Array.isArray(i)){let S=i.map(()=>"?").join(",");f.push(`type IN (${S})`),E.push(...i)}else f.push("type = ?"),E.push(i);if(a){let S=Array.isArray(a)?a:[a],R=S.map(()=>"EXISTS (SELECT 1 FROM json_each(concepts) WHERE value = ?)");E.push(...S),f.push(`(${R.join(" OR ")})`)}if(d){let S=Array.isArray(d)?d:[d],R=S.map(()=>"(EXISTS (SELECT 1 FROM json_each(files_read) WHERE value LIKE ?) OR EXISTS (SELECT 1 FROM json_each(files_modified) WHERE value LIKE ?))");S.forEach(I=>{E.push(`%${I}%`,`%${I}%`)}),f.push(`(${R.join(" OR ")})`)}let b=f.length>0?`WHERE id IN (${p}) AND ${f.join(" AND ")}`:`WHERE id IN (${p})`,A=this.db.prepare(`
      SELECT *
      FROM observations
      ${b}
      ${u}
      ${g}
    `).all(...E);if(!_)return A;let h=new Map(A.map(S=>[S.id,S]));return e.map(S=>h.get(S)).filter(S=>!!S)}getSummaryForSession(e){return this.db.prepare(`
      SELECT
        request, investigated, learned, completed, next_steps,
        files_read, files_edited, notes, prompt_number, created_at,
        created_at_epoch
      FROM session_summaries
      WHERE memory_session_id = ?
      ORDER BY created_at_epoch DESC
      LIMIT 1
    `).get(e)||null}getFilesForSession(e){let s=this.db.prepare(`
      SELECT files_read, files_modified
      FROM observations
      WHERE memory_session_id = ?
    `).all(e),r=new Set,o=new Set;for(let i of s)ie(i.files_read).forEach(a=>r.add(a)),ie(i.files_modified).forEach(a=>o.add(a));return{filesRead:Array.from(r),filesModified:Array.from(o)}}getSessionById(e){return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project,
             COALESCE(platform_source, '${N}') as platform_source,
             user_prompt, custom_title, status
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}getSdkSessionsBySessionIds(e){if(e.length===0)return[];let t=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project,
             COALESCE(platform_source, '${N}') as platform_source,
             user_prompt, custom_title,
             started_at, started_at_epoch, completed_at, completed_at_epoch, status
      FROM sdk_sessions
      WHERE memory_session_id IN (${t})
      ORDER BY started_at_epoch DESC
    `).all(...e)}getPromptNumberFromUserPrompts(e){return this.db.prepare(`
      SELECT COUNT(*) as count FROM user_prompts WHERE content_session_id = ?
    `).get(e).count}createSDKSession(e,t,s,r,o){let i=new Date,a=i.getTime(),d=ns(r,o),_=d.platformSource??N,u=this.db.prepare(`
      SELECT id, platform_source FROM sdk_sessions WHERE content_session_id = ?
    `).get(e);if(u){if(t&&this.db.prepare(`
          UPDATE sdk_sessions SET project = ?
          WHERE content_session_id = ? AND (project IS NULL OR project = '')
        `).run(t,e),d.customTitle&&this.db.prepare(`
          UPDATE sdk_sessions SET custom_title = ?
          WHERE content_session_id = ? AND custom_title IS NULL
        `).run(d.customTitle,e),d.platformSource){let p=u.platform_source?.trim()?v(u.platform_source):void 0;if(!p)this.db.prepare(`
            UPDATE sdk_sessions SET platform_source = ?
            WHERE content_session_id = ?
              AND COALESCE(platform_source, '') = ''
          `).run(d.platformSource,e);else if(p!==d.platformSource)throw new Error(`Platform source conflict for session ${e}: existing=${p}, received=${d.platformSource}`)}return u.id}return this.db.prepare(`
      INSERT INTO sdk_sessions
      (content_session_id, memory_session_id, project, platform_source, user_prompt, custom_title, started_at, started_at_epoch, status)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'active')
    `).run(e,t,_,s,d.customTitle||null,i.toISOString(),a),this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e).id}saveUserPrompt(e,t,s){let r=new Date,o=r.getTime();return this.db.prepare(`
      INSERT INTO user_prompts
      (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `).run(e,t,s,r.toISOString(),o).lastInsertRowid}getUserPrompt(e,t){return this.db.prepare(`
      SELECT prompt_text
      FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
      LIMIT 1
    `).get(e,t)?.prompt_text??null}storeObservation(e,t,s,r,o=0,i,a){let d=i??Date.now(),_=new Date(d).toISOString(),u=W(e,s.title,s.narrative),p=this.db.prepare(`
      INSERT INTO observations
      (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
       files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
       generated_by_model, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_session_id, content_hash) DO NOTHING
      RETURNING id, created_at_epoch
    `).get(e,t,s.type,s.title,s.subtitle,JSON.stringify(s.facts),s.narrative,JSON.stringify(s.concepts),JSON.stringify(s.files_read),JSON.stringify(s.files_modified),r||null,o,s.agent_type??null,s.agent_id??null,u,_,d,a||null,s.metadata??null);if(p)return{id:p.id,createdAtEpoch:p.created_at_epoch};let E=this.db.prepare("SELECT id, created_at_epoch FROM observations WHERE memory_session_id = ? AND content_hash = ?").get(e,u);if(!E)throw new Error(`storeObservation: ON CONFLICT without existing row for content_hash=${u}`);return{id:E.id,createdAtEpoch:E.created_at_epoch}}storeSummary(e,t,s,r,o=0,i){let a=i??Date.now(),d=new Date(a).toISOString(),u=this.db.prepare(`
      INSERT INTO session_summaries
      (memory_session_id, project, request, investigated, learned, completed,
       next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,t,s.request,s.investigated,s.learned,s.completed,s.next_steps,s.notes,r||null,o,d,a);return{id:Number(u.lastInsertRowid),createdAtEpoch:a}}storeObservations(e,t,s,r,o,i=0,a,d){let _=a??Date.now(),u=new Date(_).toISOString();return this.db.transaction(()=>{let p=[],E=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
         generated_by_model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_session_id, content_hash) DO NOTHING
        RETURNING id
      `),f=this.db.prepare("SELECT id FROM observations WHERE memory_session_id = ? AND content_hash = ?");for(let m of s){let A=W(e,m.title,m.narrative),h=E.get(e,t,m.type,m.title,m.subtitle,JSON.stringify(m.facts),m.narrative,JSON.stringify(m.concepts),JSON.stringify(m.files_read),JSON.stringify(m.files_modified),o||null,i,m.agent_type??null,m.agent_id??null,A,u,_,d||null);if(h){p.push(h.id);continue}let S=f.get(e,A);if(!S)throw new Error(`storeObservations: ON CONFLICT without existing row for content_hash=${A}`);p.push(S.id)}let b=null;if(r){let A=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,r.request,r.investigated,r.learned,r.completed,r.next_steps,r.notes,o||null,i,u,_);b=Number(A.lastInsertRowid)}return{observationIds:p,summaryId:b,createdAtEpoch:_}})()}storeObservationsAndMarkComplete(e,t,s,r,o,i,a,d=0,_,u){let g=_??Date.now(),p=new Date(g).toISOString();return this.db.transaction(()=>{let f=[],b=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
         generated_by_model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_session_id, content_hash) DO NOTHING
        RETURNING id
      `),m=this.db.prepare("SELECT id FROM observations WHERE memory_session_id = ? AND content_hash = ?");for(let R of s){let I=W(e,R.title,R.narrative),H=b.get(e,t,R.type,R.title,R.subtitle,JSON.stringify(R.facts),R.narrative,JSON.stringify(R.concepts),JSON.stringify(R.files_read),JSON.stringify(R.files_modified),a||null,d,R.agent_type??null,R.agent_id??null,I,p,g,u||null);if(H){f.push(H.id);continue}let Re=m.get(e,I);if(!Re)throw new Error(`storeObservationsAndMarkComplete: ON CONFLICT without existing row for content_hash=${I}`);f.push(Re.id)}let A;if(r){let I=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,r.request,r.investigated,r.learned,r.completed,r.next_steps,r.notes,a||null,d,p,g);A=Number(I.lastInsertRowid)}if(this.db.prepare(`
        DELETE FROM pending_messages
        WHERE id = ? AND status = 'processing'
      `).run(o).changes!==1)throw new Error(`storeObservationsAndMarkComplete: failed to complete pending message ${o}`);return{observationIds:f,summaryId:A,createdAtEpoch:g}})()}getSessionSummariesByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:r,project:o}=t,i=s==="relevance",a=i?"":`ORDER BY created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,d=r?`LIMIT ${r}`:"",_=e.map(()=>"?").join(","),u=[...e],g=o?`WHERE id IN (${_}) AND project = ?`:`WHERE id IN (${_})`;o&&u.push(o);let E=this.db.prepare(`
      SELECT * FROM session_summaries
      ${g}
      ${a}
      ${d}
    `).all(...u);if(!i)return E;let f=new Map(E.map(b=>[b.id,b]));return e.map(b=>f.get(b)).filter(b=>!!b)}getUserPromptsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:r,project:o}=t,i=s==="relevance",a=i?"":`ORDER BY up.created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,d=r?`LIMIT ${r}`:"",_=e.map(()=>"?").join(","),u=[...e],g=o?"AND s.project = ?":"";o&&u.push(o);let E=this.db.prepare(`
      SELECT
        up.*,
        s.project,
        s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.id IN (${_}) ${g}
      ${a}
      ${d}
    `).all(...u);if(!i)return E;let f=new Map(E.map(b=>[b.id,b]));return e.map(b=>f.get(b)).filter(b=>!!b)}getTimelineAroundTimestamp(e,t=10,s=10,r){return this.getTimelineAroundObservation(null,e,t,s,r)}getTimelineAroundObservation(e,t,s=10,r=10,o){let i=o?"AND project = ?":"",a=o?[o]:[],d,_;if(e!==null){let m=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id <= ? ${i}
        ORDER BY id DESC
        LIMIT ?
      `,A=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id >= ? ${i}
        ORDER BY id ASC
        LIMIT ?
      `;try{let h=this.db.prepare(m).all(e,...a,s+1),S=this.db.prepare(A).all(e,...a,r+1);if(h.length===0&&S.length===0)return{observations:[],sessions:[],prompts:[]};d=h.length>0?h[h.length-1].created_at_epoch:t,_=S.length>0?S[S.length-1].created_at_epoch:t}catch(h){return h instanceof Error?l.error("DB","Error getting boundary observations",{project:o},h):l.error("DB","Error getting boundary observations with non-Error",{},new Error(String(h))),{observations:[],sessions:[],prompts:[]}}}else{let m=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch <= ? ${i}
        ORDER BY created_at_epoch DESC
        LIMIT ?
      `,A=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch >= ? ${i}
        ORDER BY created_at_epoch ASC
        LIMIT ?
      `;try{let h=this.db.prepare(m).all(t,...a,s),S=this.db.prepare(A).all(t,...a,r+1);if(h.length===0&&S.length===0)return{observations:[],sessions:[],prompts:[]};d=h.length>0?h[h.length-1].created_at_epoch:t,_=S.length>0?S[S.length-1].created_at_epoch:t}catch(h){return h instanceof Error?l.error("DB","Error getting boundary timestamps",{project:o},h):l.error("DB","Error getting boundary timestamps with non-Error",{},new Error(String(h))),{observations:[],sessions:[],prompts:[]}}}let u=`
      SELECT *
      FROM observations
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${i}
      ORDER BY created_at_epoch ASC
    `,g=`
      SELECT *
      FROM session_summaries
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${i}
      ORDER BY created_at_epoch ASC
    `,p=`
      SELECT up.*, s.project, s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.created_at_epoch >= ? AND up.created_at_epoch <= ? ${i.replace("project","s.project")}
      ORDER BY up.created_at_epoch ASC
    `,E=this.db.prepare(u).all(d,_,...a),f=this.db.prepare(g).all(d,_,...a),b=this.db.prepare(p).all(d,_,...a);return{observations:E,sessions:f.map(m=>({id:m.id,memory_session_id:m.memory_session_id,project:m.project,request:m.request,completed:m.completed,next_steps:m.next_steps,created_at:m.created_at,created_at_epoch:m.created_at_epoch})),prompts:b.map(m=>({id:m.id,content_session_id:m.content_session_id,prompt_number:m.prompt_number,prompt_text:m.prompt_text,project:m.project,created_at:m.created_at,created_at_epoch:m.created_at_epoch}))}}getPromptById(e){return this.db.prepare(`
      SELECT
        p.id,
        p.content_session_id,
        p.prompt_number,
        p.prompt_text,
        s.project,
        p.created_at,
        p.created_at_epoch
      FROM user_prompts p
      LEFT JOIN sdk_sessions s ON p.content_session_id = s.content_session_id
      WHERE p.id = ?
      LIMIT 1
    `).get(e)||null}getPromptsByIds(e){if(e.length===0)return[];let t=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT
        p.id,
        p.content_session_id,
        p.prompt_number,
        p.prompt_text,
        s.project,
        p.created_at,
        p.created_at_epoch
      FROM user_prompts p
      LEFT JOIN sdk_sessions s ON p.content_session_id = s.content_session_id
      WHERE p.id IN (${t})
      ORDER BY p.created_at_epoch DESC
    `).all(...e)}getSessionSummaryById(e){return this.db.prepare(`
      SELECT
        id,
        memory_session_id,
        content_session_id,
        project,
        user_prompt,
        request_summary,
        learned_summary,
        status,
        created_at,
        created_at_epoch
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}getOrCreateManualSession(e){let t=`manual-${e}`,s=`manual-content-${e}`;if(this.db.prepare("SELECT memory_session_id FROM sdk_sessions WHERE memory_session_id = ?").get(t))return t;let o=new Date;return this.db.prepare(`
      INSERT INTO sdk_sessions (memory_session_id, content_session_id, project, platform_source, started_at, started_at_epoch, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(t,s,e,N,o.toISOString(),o.getTime()),l.info("SESSION","Created manual session",{memorySessionId:t,project:e}),t}close(){this.db.close()}importSdkSession(e){let t=this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e.content_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO sdk_sessions (
        content_session_id, memory_session_id, project, platform_source, user_prompt,
        started_at, started_at_epoch, completed_at, completed_at_epoch, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.content_session_id,e.memory_session_id,e.project,v(e.platform_source),e.user_prompt,e.started_at,e.started_at_epoch,e.completed_at,e.completed_at_epoch,e.status).lastInsertRowid}}importSessionSummary(e){let t=this.db.prepare("SELECT id FROM session_summaries WHERE memory_session_id = ?").get(e.memory_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO session_summaries (
        memory_session_id, project, request, investigated, learned,
        completed, next_steps, files_read, files_edited, notes,
        prompt_number, discovery_tokens, created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.memory_session_id,e.project,e.request,e.investigated,e.learned,e.completed,e.next_steps,e.files_read,e.files_edited,e.notes,e.prompt_number,e.discovery_tokens||0,e.created_at,e.created_at_epoch).lastInsertRowid}}importObservation(e){let t=this.db.prepare(`
      SELECT id FROM observations
      WHERE memory_session_id = ? AND title = ? AND created_at_epoch = ?
    `).get(e.memory_session_id,e.title,e.created_at_epoch);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO observations (
        memory_session_id, project, text, type, title, subtitle,
        facts, narrative, concepts, files_read, files_modified,
        prompt_number, discovery_tokens, agent_type, agent_id,
        created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.memory_session_id,e.project,e.text,e.type,e.title,e.subtitle,e.facts,e.narrative,e.concepts,e.files_read,e.files_modified,e.prompt_number,e.discovery_tokens||0,e.agent_type??null,e.agent_id??null,e.created_at,e.created_at_epoch).lastInsertRowid}}fetchObservationForEnrichment(e){let t=this.db.prepare("SELECT type, title, subtitle, narrative, facts, files_read, files_modified, agent_type FROM observations WHERE id = ?").get(e);if(!t)return null;let s=r=>{if(!r)return[];try{let o=JSON.parse(r);return Array.isArray(o)?o:[]}catch{return[]}};return{type:t.type,title:t.title,subtitle:t.subtitle,narrative:t.narrative,facts:s(t.facts),files_read:s(t.files_read),files_modified:s(t.files_modified),agent_type:t.agent_type}}updateObservationDevWorkflowMetadata(e,t){let s=this.db.prepare("SELECT metadata FROM observations WHERE id = ?").get(e);if(!s)return;let r={};if(s.metadata)try{let i=JSON.parse(s.metadata);i&&typeof i=="object"&&!Array.isArray(i)&&(r=i)}catch{}let o={...r,dev_workflow:t};this.db.prepare("UPDATE observations SET metadata = ? WHERE id = ?").run(JSON.stringify(o),e)}updateObservationMetadataPatch(e,t){let s=this.db.prepare("SELECT metadata FROM observations WHERE id = ?").get(e);if(!s){l.warn("TRAINING",`updateObservationMetadataPatch: no observation id=${e}`);return}let r={};if(s.metadata)try{let i=JSON.parse(s.metadata);i&&typeof i=="object"&&!Array.isArray(i)&&(r=i)}catch{}let o={...r,...t};this.db.prepare("UPDATE observations SET metadata = ? WHERE id = ?").run(JSON.stringify(o),e)}upsertSessionRecord(e){let t=Date.now(),s=new Date(t).toISOString();this.db.prepare(`INSERT INTO session_records (
        id, memory_session_id, title, date, projects, branch, status, type,
        topics, tags, last_updated, sdk_touched, apps_touched, commits,
        related_sessions, specs, content, observation_refs, generation_metadata,
        created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, status=excluded.status, last_updated=excluded.last_updated,
        topics=excluded.topics, tags=excluded.tags, commits=excluded.commits,
        content=excluded.content, observation_refs=excluded.observation_refs,
        generation_metadata=excluded.generation_metadata`).run(e.id,e.memory_session_id,e.title,e.date,JSON.stringify(e.projects),e.branch??null,e.status,e.type,JSON.stringify(e.topics),JSON.stringify(e.tags),e.last_updated,JSON.stringify(e.sdk_touched),JSON.stringify(e.apps_touched),JSON.stringify(e.commits),JSON.stringify(e.related_sessions),JSON.stringify(e.specs),JSON.stringify(e.content),JSON.stringify(e.observation_refs),e.generation_metadata?JSON.stringify(e.generation_metadata):null,s,t)}listSessionRecords(e=50){return this.db.prepare("SELECT id, memory_session_id, title, date, status, topics FROM session_records ORDER BY created_at_epoch DESC LIMIT ?").all(e).map(s=>({...s,topics:s.topics?JSON.parse(s.topics):[]}))}upsertLearningRecord(e){let t=Date.now(),s=new Date(t).toISOString();this.db.prepare(`INSERT INTO learning_records (
        id, topic, last_synthesized, applies_to, summary, content,
        source_session_ids, source_lesson_ids, source_issue_ids,
        confidence_distribution, generation_cost_usd, generation_input_tokens,
        needs_review, created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(topic) DO UPDATE SET
        last_synthesized=excluded.last_synthesized,
        applies_to=excluded.applies_to,
        summary=excluded.summary,
        content=excluded.content,
        source_session_ids=excluded.source_session_ids,
        source_lesson_ids=excluded.source_lesson_ids,
        source_issue_ids=excluded.source_issue_ids,
        confidence_distribution=excluded.confidence_distribution,
        generation_cost_usd=excluded.generation_cost_usd,
        generation_input_tokens=excluded.generation_input_tokens,
        needs_review=excluded.needs_review`).run(e.id,e.topic,e.last_synthesized,JSON.stringify(e.applies_to),e.summary,JSON.stringify(e.content),JSON.stringify(e.source_session_ids),JSON.stringify(e.source_lesson_ids),JSON.stringify(e.source_issue_ids),JSON.stringify(e.confidence_distribution),e.generation_cost_usd??null,e.generation_input_tokens??null,e.needs_review?1:0,s,t)}listLearningRecords(){return this.db.prepare("SELECT id, topic, last_synthesized, summary, needs_review FROM learning_records ORDER BY last_synthesized DESC").all().map(t=>({...t,needs_review:t.needs_review===1}))}markLearningRecordsNeedReview(e){if(e.length===0)return;let t=e.map(()=>"?").join(",");this.db.prepare(`UPDATE learning_records SET needs_review = 1 WHERE topic IN (${t})`).run(...e)}upsertGoldenDocSource(e){this.db.prepare(`INSERT INTO golden_doc_sources (
        id, golden_doc_path, generated_at, source_learning_ids,
        generation_prompt_hash, generation_cost_usd, human_reviewed,
        reviewer, needs_review, last_review_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(golden_doc_path) DO UPDATE SET
        generated_at=excluded.generated_at,
        source_learning_ids=excluded.source_learning_ids,
        generation_prompt_hash=excluded.generation_prompt_hash,
        generation_cost_usd=excluded.generation_cost_usd,
        human_reviewed=excluded.human_reviewed,
        reviewer=excluded.reviewer,
        needs_review=excluded.needs_review,
        last_review_at=excluded.last_review_at`).run(e.id,e.golden_doc_path,e.generated_at,JSON.stringify(e.source_learning_ids),e.generation_prompt_hash,e.generation_cost_usd??null,e.human_reviewed?1:0,e.reviewer??null,e.needs_review?1:0,e.last_review_at??null)}rebuildObservationsFTSIndex(){this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'").all().length>0&&this.db.run("INSERT INTO observations_fts(observations_fts) VALUES('rebuild')")}importUserPrompt(e){let t=this.db.prepare(`
      SELECT id FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
    `).get(e.content_session_id,e.prompt_number);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO user_prompts (
        content_session_id, prompt_number, prompt_text,
        created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?)
    `).run(e.content_session_id,e.prompt_number,e.prompt_text,e.created_at,e.created_at_epoch).lastInsertRowid}}};var L=require("fs"),k=require("path"),de=require("os"),q=class{static DEFAULTS={CLAUDE_MEM_MODEL:"claude-haiku-4-5-20251001",CLAUDE_MEM_CONTEXT_OBSERVATIONS:"50",CLAUDE_MEM_WORKER_PORT:String(37700+(process.getuid?.()??77)%100),CLAUDE_MEM_WORKER_HOST:"127.0.0.1",CLAUDE_MEM_SKIP_TOOLS:"ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion",CLAUDE_MEM_PROVIDER:"claude",CLAUDE_MEM_CLAUDE_AUTH_METHOD:"subscription",CLAUDE_MEM_GEMINI_API_KEY:"",CLAUDE_MEM_GEMINI_MODEL:"gemini-2.5-flash-lite",CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED:"true",CLAUDE_MEM_GEMINI_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_GEMINI_MAX_TOKENS:"100000",CLAUDE_MEM_OPENROUTER_API_KEY:"",CLAUDE_MEM_OPENROUTER_MODEL:"xiaomi/mimo-v2-flash:free",CLAUDE_MEM_OPENROUTER_SITE_URL:"",CLAUDE_MEM_OPENROUTER_APP_NAME:"claude-mem",CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_OPENROUTER_MAX_TOKENS:"100000",CLAUDE_MEM_DATA_DIR:(0,k.join)((0,de.homedir)(),".claude-mem"),CLAUDE_MEM_LOG_LEVEL:"INFO",CLAUDE_MEM_PYTHON_VERSION:"3.13",CLAUDE_CODE_PATH:"",CLAUDE_MEM_MODE:"code",CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT:"true",CLAUDE_MEM_CONTEXT_FULL_COUNT:"0",CLAUDE_MEM_CONTEXT_FULL_FIELD:"narrative",CLAUDE_MEM_CONTEXT_SESSION_COUNT:"10",CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY:"true",CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE:"false",CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT:"true",CLAUDE_MEM_DIGEST_GROUP:"session",CLAUDE_MEM_DIGEST_WINDOW_DAYS:"7",CLAUDE_MEM_DIGEST_MAX_BLOCKS:"10",CLAUDE_MEM_DIGEST_FILES_PER_BLOCK:"4",CLAUDE_MEM_DIGEST_DESCRIBE:"true",CLAUDE_MEM_WELCOME_HINT_ENABLED:"true",CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED:"false",CLAUDE_MEM_FOLDER_USE_LOCAL_MD:"false",CLAUDE_MEM_TRANSCRIPTS_ENABLED:"true",CLAUDE_MEM_TRANSCRIPTS_CONFIG_PATH:(0,k.join)((0,de.homedir)(),".claude-mem","transcript-watch.json"),CLAUDE_MEM_CODEX_TRANSCRIPT_INGESTION:"false",CLAUDE_MEM_MAX_CONCURRENT_AGENTS:"2",CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD:"3",CLAUDE_MEM_EXCLUDED_PROJECTS:"",CLAUDE_MEM_FOLDER_MD_EXCLUDE:"[]",CLAUDE_MEM_SEMANTIC_INJECT:"false",CLAUDE_MEM_SEMANTIC_INJECT_LIMIT:"5",CLAUDE_MEM_TIER_ROUTING_ENABLED:"true",CLAUDE_MEM_TIER_SIMPLE_MODEL:"haiku",CLAUDE_MEM_TIER_SUMMARY_MODEL:"",CLAUDE_MEM_CHROMA_ENABLED:"true",CLAUDE_MEM_CHROMA_MODE:"local",CLAUDE_MEM_CHROMA_HOST:"127.0.0.1",CLAUDE_MEM_CHROMA_PORT:"8000",CLAUDE_MEM_CHROMA_SSL:"false",CLAUDE_MEM_CHROMA_API_KEY:"",CLAUDE_MEM_CHROMA_TENANT:"default_tenant",CLAUDE_MEM_CHROMA_DATABASE:"default_database",CLAUDE_MEM_TELEGRAM_ENABLED:"true",CLAUDE_MEM_TELEGRAM_BOT_TOKEN:"",CLAUDE_MEM_TELEGRAM_CHAT_ID:"",CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES:"security_alert",CLAUDE_MEM_TELEGRAM_TRIGGER_CONCEPTS:"",CLAUDE_MEM_QUEUE_ENGINE:"sqlite",CLAUDE_MEM_REDIS_URL:"",CLAUDE_MEM_REDIS_HOST:"127.0.0.1",CLAUDE_MEM_REDIS_PORT:"6379",CLAUDE_MEM_REDIS_MODE:"external",CLAUDE_MEM_QUEUE_REDIS_PREFIX:`claude_mem_${process.env.CLAUDE_MEM_WORKER_PORT??String(37700+(process.getuid?.()??77)%100)}`,CLAUDE_MEM_AUTH_MODE:"api-key",CLAUDE_MEM_RUNTIME:"worker",CLAUDE_MEM_SERVER_BETA_URL:`http://127.0.0.1:${process.env.CLAUDE_MEM_SERVER_PORT??String(37877+(process.getuid?.()??77)%100)}`,CLAUDE_MEM_SERVER_BETA_API_KEY:"",CLAUDE_MEM_SERVER_BETA_PROJECT_ID:""};static getAllDefaults(){return{...this.DEFAULTS}}static get(e){return process.env[e]??this.DEFAULTS[e]}static getInt(e){let t=this.get(e);return parseInt(t,10)}static getBool(e){let t=this.get(e);return t==="true"||t===!0}static applyEnvOverrides(e){let t={...e};for(let s of Object.keys(this.DEFAULTS))process.env[s]!==void 0&&(t[s]=process.env[s]);return t}static loadFromFile(e){try{if(!(0,L.existsSync)(e)){let i=this.getAllDefaults();try{let a=(0,k.dirname)(e);(0,L.existsSync)(a)||(0,L.mkdirSync)(a,{recursive:!0}),(0,L.writeFileSync)(e,JSON.stringify(i,null,2),"utf-8"),console.log("[SETTINGS] Created settings file with defaults:",e)}catch(a){console.warn("[SETTINGS] Failed to create settings file, using in-memory defaults:",e,a instanceof Error?a.message:String(a))}return this.applyEnvOverrides(i)}let t=(0,L.readFileSync)(e,"utf-8"),s=JSON.parse(t),r=s;if(s.env&&typeof s.env=="object"){r=s.env;try{(0,L.writeFileSync)(e,JSON.stringify(r,null,2),"utf-8"),console.log("[SETTINGS] Migrated settings file from nested to flat schema:",e)}catch(i){console.warn("[SETTINGS] Failed to auto-migrate settings file:",e,i instanceof Error?i.message:String(i))}}let o={...this.DEFAULTS};for(let i of Object.keys(this.DEFAULTS))r[i]!==void 0&&(o[i]=r[i]);return this.applyEnvOverrides(o)}catch(t){return console.warn("[SETTINGS] Failed to load settings, using defaults:",e,t instanceof Error?t.message:String(t)),this.applyEnvOverrides(this.getAllDefaults())}}};var $=require("fs"),Y=require("path");var C=class n{static instance=null;activeMode=null;modesDir;constructor(){let e=Me(),t=[(0,Y.join)(e,"modes"),(0,Y.join)(e,"..","plugin","modes")],s=t.find(r=>(0,$.existsSync)(r));this.modesDir=s||t[0]}static getInstance(){return n.instance||(n.instance=new n),n.instance}parseInheritance(e){let t=e.split("--");if(t.length===1)return{hasParent:!1,parentId:"",overrideId:""};if(t.length>2)throw new Error(`Invalid mode inheritance: ${e}. Only one level of inheritance supported (parent--override)`);return{hasParent:!0,parentId:t[0],overrideId:e}}isPlainObject(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}deepMerge(e,t){let s={...e};for(let r in t){let o=t[r],i=e[r];this.isPlainObject(o)&&this.isPlainObject(i)?s[r]=this.deepMerge(i,o):s[r]=o}return s}loadModeFile(e){let t=(0,Y.join)(this.modesDir,`${e}.json`);if(!(0,$.existsSync)(t))throw new Error(`Mode file not found: ${t}`);let s=(0,$.readFileSync)(t,"utf-8");return JSON.parse(s)}loadMode(e){let t=this.parseInheritance(e);if(!t.hasParent)try{let d=this.loadModeFile(e);return this.activeMode=d,l.debug("SYSTEM",`Loaded mode: ${d.name} (${e})`,void 0,{types:d.observation_types.map(_=>_.id),concepts:d.observation_concepts.map(_=>_.id)}),d}catch(d){if(d instanceof Error?l.warn("WORKER",`Mode file not found: ${e}, falling back to 'code'`,{message:d.message}):l.warn("WORKER",`Mode file not found: ${e}, falling back to 'code'`,{error:String(d)}),e==="code")throw new Error("Critical: code.json mode file missing");return this.loadMode("code")}let{parentId:s,overrideId:r}=t,o;try{o=this.loadMode(s)}catch(d){d instanceof Error?l.warn("WORKER",`Parent mode '${s}' not found for ${e}, falling back to 'code'`,{message:d.message}):l.warn("WORKER",`Parent mode '${s}' not found for ${e}, falling back to 'code'`,{error:String(d)}),o=this.loadMode("code")}let i;try{i=this.loadModeFile(r),l.debug("SYSTEM",`Loaded override file: ${r} for parent ${s}`)}catch(d){return d instanceof Error?l.warn("WORKER",`Override file '${r}' not found, using parent mode '${s}' only`,{message:d.message}):l.warn("WORKER",`Override file '${r}' not found, using parent mode '${s}' only`,{error:String(d)}),this.activeMode=o,o}if(!i)return l.warn("SYSTEM",`Invalid override file: ${r}, using parent mode '${s}' only`),this.activeMode=o,o;let a=this.deepMerge(o,i);return this.activeMode=a,l.debug("SYSTEM",`Loaded mode with inheritance: ${a.name} (${e} = ${s} + ${r})`,void 0,{parent:s,override:r,types:a.observation_types.map(d=>d.id),concepts:a.observation_concepts.map(d=>d.id)}),a}getActiveMode(){if(!this.activeMode)throw new Error("No mode loaded. Call loadMode() first.");return this.activeMode}getObservationTypes(){return this.getActiveMode().observation_types}getObservationConcepts(){return this.getActiveMode().observation_concepts}getTypeIcon(e){return this.getObservationTypes().find(s=>s.id===e)?.emoji||"\u{1F4DD}"}getWorkEmoji(e){return this.getObservationTypes().find(s=>s.id===e)?.work_emoji||"\u{1F4DD}"}validateType(e){return this.getObservationTypes().some(t=>t.id===e)}getTypeLabel(e){return this.getObservationTypes().find(s=>s.id===e)?.label||e}};function _e(){let n=w.settings(),e=q.loadFromFile(n),t=C.getInstance().getActiveMode(),s=new Set(t.observation_types.map(o=>o.id)),r=new Set(t.observation_concepts.map(o=>o.id));return{totalObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_OBSERVATIONS,10),fullObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_FULL_COUNT,10),sessionCount:parseInt(e.CLAUDE_MEM_CONTEXT_SESSION_COUNT,10),showReadTokens:e.CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS==="true",showWorkTokens:e.CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS==="true",showSavingsAmount:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT==="true",showSavingsPercent:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT==="true",observationTypes:s,observationConcepts:r,fullObservationField:e.CLAUDE_MEM_CONTEXT_FULL_FIELD,showLastSummary:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY==="true",showLastMessage:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE==="true",digestGroup:rs(e.CLAUDE_MEM_DIGEST_GROUP),digestWindowDays:parseInt(e.CLAUDE_MEM_DIGEST_WINDOW_DAYS,10),digestMaxBlocks:parseInt(e.CLAUDE_MEM_DIGEST_MAX_BLOCKS,10),digestFilesPerBlock:parseInt(e.CLAUDE_MEM_DIGEST_FILES_PER_BLOCK,10),digestDescribe:e.CLAUDE_MEM_DIGEST_DESCRIBE!=="false"}}function rs(n){return n==="topic"||n==="flat"?n:"session"}var c={reset:"\x1B[0m",bright:"\x1B[1m",dim:"\x1B[2m",cyan:"\x1B[36m",green:"\x1B[32m",yellow:"\x1B[33m",blue:"\x1B[34m",magenta:"\x1B[35m",gray:"\x1B[90m",red:"\x1B[31m"},$e=4,ce=1;function ue(n){let e=(n.title?.length||0)+(n.subtitle?.length||0)+(n.narrative?.length||0)+JSON.stringify(n.facts||[]).length;return Math.ceil(e/$e)}function le(n){let e=n.length,t=n.reduce((i,a)=>i+ue(a),0),s=n.reduce((i,a)=>i+(a.discovery_tokens||0),0),r=s-t,o=s>0?Math.round(r/s*100):0;return{totalObservations:e,totalReadTokens:t,totalDiscoveryTokens:s,savings:r,savingsPercent:o}}function os(n){return C.getInstance().getWorkEmoji(n)}function F(n,e){let t=ue(n),s=n.discovery_tokens||0,r=os(n.type),o=s>0?`${r} ${s.toLocaleString()}`:"-";return{readTokens:t,discoveryTokens:s,discoveryDisplay:o,workEmoji:r}}function K(n){return n.showReadTokens||n.showWorkTokens||n.showSavingsAmount||n.showSavingsPercent}var Pe=U(require("path"),1),J=require("fs");var is=["private","claude-mem-context","system_instruction","system-instruction","persisted-output","system-reminder"],fn=new RegExp(`<(${is.join("|")})\\b[^>]*>[\\s\\S]*?</\\1>`,"g"),Fe=/<system-reminder>[\s\S]*?<\/system-reminder>/g;var as=["task-notification"],Sn=new RegExp(`^\\s*<(${as.join("|")})\\b[^>]*>(?:(?!<\\1\\b|</\\1\\b)[\\s\\S])*</\\1>\\s*$`),hn=256*1024;function me(n,e,t){let s=Array.from(t.observationTypes),r=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(",");return n.db.prepare(`
    SELECT
      o.id,
      o.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      o.type,
      o.title,
      o.subtitle,
      o.narrative,
      o.facts,
      o.concepts,
      o.files_read,
      o.files_modified,
      o.discovery_tokens,
      o.created_at,
      o.created_at_epoch
    FROM observations o
    LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
    WHERE (o.project = ? OR o.merged_into_project = ?)
      AND type IN (${r})
      AND EXISTS (
        SELECT 1 FROM json_each(o.concepts)
        WHERE value IN (${i})
      )
    ORDER BY o.created_at_epoch DESC
    LIMIT ?
  `).all(e,e,...s,...o,t.totalObservationCount)}function pe(n,e,t){return n.db.prepare(`
    SELECT
      ss.id,
      ss.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      ss.request,
      ss.investigated,
      ss.learned,
      ss.completed,
      ss.next_steps,
      ss.created_at,
      ss.created_at_epoch
    FROM session_summaries ss
    LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
    WHERE (ss.project = ? OR ss.merged_into_project = ?)
    ORDER BY ss.created_at_epoch DESC
    LIMIT ?
  `).all(e,e,t.sessionCount+ce)}function Ge(n,e,t){let s=Array.from(t.observationTypes),r=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(","),a=e.map(()=>"?").join(",");return n.db.prepare(`
    SELECT
      o.id,
      o.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      o.type,
      o.title,
      o.subtitle,
      o.narrative,
      o.facts,
      o.concepts,
      o.files_read,
      o.files_modified,
      o.discovery_tokens,
      o.created_at,
      o.created_at_epoch,
      o.project
    FROM observations o
    LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
    WHERE (o.project IN (${a})
           OR o.merged_into_project IN (${a}))
      AND type IN (${r})
      AND EXISTS (
        SELECT 1 FROM json_each(o.concepts)
        WHERE value IN (${i})
      )
    ORDER BY o.created_at_epoch DESC
    LIMIT ?
  `).all(...e,...e,...s,...o,t.totalObservationCount)}function He(n,e,t){let s=e.map(()=>"?").join(",");return n.db.prepare(`
    SELECT
      ss.id,
      ss.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      ss.request,
      ss.investigated,
      ss.learned,
      ss.completed,
      ss.next_steps,
      ss.created_at,
      ss.created_at_epoch,
      ss.project
    FROM session_summaries ss
    LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
    WHERE (ss.project IN (${s})
           OR ss.merged_into_project IN (${s}))
    ORDER BY ss.created_at_epoch DESC
    LIMIT ?
  `).all(...e,...e,t.sessionCount+ce)}function ds(n){return n.replace(/\//g,"-")}function _s(n){if(!n.includes('"type":"assistant"'))return null;let e=JSON.parse(n);if(e.type==="assistant"&&e.message?.content&&Array.isArray(e.message.content)){let t="";for(let s of e.message.content)s.type==="text"&&(t+=s.text);if(t=t.replace(Fe,"").trim(),t)return t}return null}function cs(n){for(let e=n.length-1;e>=0;e--)try{let t=_s(n[e]);if(t)return t}catch(t){t instanceof Error?l.debug("WORKER","Skipping malformed transcript line",{lineIndex:e},t):l.debug("WORKER","Skipping malformed transcript line",{lineIndex:e,error:String(t)});continue}return""}function us(n){try{if(!(0,J.existsSync)(n))return{userMessage:"",assistantMessage:""};let e=(0,J.readFileSync)(n,"utf-8").trim();if(!e)return{userMessage:"",assistantMessage:""};let t=e.split(`
`).filter(r=>r.trim());return{userMessage:"",assistantMessage:cs(t)}}catch(e){return e instanceof Error?l.failure("WORKER","Failed to extract prior messages from transcript",{transcriptPath:n},e):l.warn("WORKER","Failed to extract prior messages from transcript",{transcriptPath:n,error:String(e)}),{userMessage:"",assistantMessage:""}}}function Ee(n,e,t,s){if(!e.showLastMessage||n.length===0)return{userMessage:"",assistantMessage:""};let r=n.find(d=>d.memory_session_id!==t);if(!r)return{userMessage:"",assistantMessage:""};let o=r.memory_session_id,i=ds(s),a=Pe.default.join(y,"projects",i,`${o}.jsonl`);return us(a)}function je(n,e){let t=e[0]?.id;return n.map((s,r)=>{let o=r===0?null:e[r+1];return{...s,displayEpoch:o?o.created_at_epoch:s.created_at_epoch,displayTime:o?o.created_at:s.created_at,shouldShowLink:s.id!==t}})}function ge(n,e){let t=[...n.map(s=>({type:"observation",data:s})),...e.map(s=>({type:"summary",data:s}))];return t.sort((s,r)=>{let o=s.type==="observation"?s.data.created_at_epoch:s.data.displayEpoch,i=r.type==="observation"?r.data.created_at_epoch:r.data.displayEpoch;return o-i}),t}function Xe(n,e){return new Set(n.slice(0,e).map(t=>t.id))}var ls={group:"session",windowDays:7,maxBlocks:10,filesPerBlock:4,scanLimit:2e3,describe:!0};function Be(n){if(!n)return"";let e=n.split(`
`)[0];return e=e.replace(/^\/Volumes\/[^/]+\/code\/(monorepo|ai)\//,"").replace(/^.*\/\.claude\/plugins\/[^/]+\//,"").replace(/^\/Volumes\/HD\/code\//,""),e.length>70&&(e="\u2026"+e.slice(-69)),e}function We(n){if(!n)return!1;let e=n.split(`
`)[0];return!(!e.includes("/")||/^\s*(cd|git|npm|pnpm|bun|node|echo|cat)\s/.test(e)||/[;|&]|2>&1|\$\(|<<|\bgrep\b|\becho\b/.test(e))}function ms(n){return n.startsWith("mcp__")?(n.split("__").pop()??n)||"external":n}function ps(n){if(!n)return"";let e=n.split(`
`)[0];if(We(e)){let t=e.replace(/\/+$/,"").split("/").pop()??e;return t.length>0?t:Be(e)}return e.length>48?e.slice(0,47)+"\u2026":e}function Ve(n){if(!n)return"";let e=n.split(`
`)[0],t=e.match(/([^/]+)\/\.claude\/worktrees\/([^/]+)/);return t?`${t[1]}/${t[2]}`:(t=e.match(/_specs\/([^/]+)/),t?`_specs/${t[1]}`:(t=e.match(/\.claude\/(?:skills|plugins|agents)\/([^/]+)/),t?`.claude/${t[1]}`:(t=e.match(/\/code\/(?:monorepo|ai)\/([^/]+)/)??e.match(/\/code\/([^/]+)\//),t&&t[1]!==".claude"&&t[1]!=="monorepo"&&t[1]!=="ai"?t[1]:"")))}function Q(n){return new Date(n).toISOString().slice(0,10)}function Te(n){return new Date(n).toISOString().slice(5,10)}function qe(n){let e=new Set,t=[];for(let s of n){let r=ms(s.verb??s.tool_name.toLowerCase());e.has(r)||(e.add(r),t.push(r))}return t}function Ye(n,e){let t=new Set,s=[],r=n.filter(i=>We(i.target)),o=r.length>0?r:n.filter(i=>i.target);for(let i of o){let a=ps(i.target);!a||t.has(a)||(t.add(a),s.push(a))}return{shown:s.slice(0,e),extra:Math.max(0,s.length-e)}}function Es(n){let e=new Map;for(let r of n){let o=Ve(r.target);o&&e.set(o,(e.get(o)??0)+1)}if(e.size===0)return{label:"misc",otherAreas:0};let t="",s=-1;for(let[r,o]of e)o>s&&(t=r,s=o);return{label:t,otherAreas:e.size-1}}function gs(n,e,t){let s=e.map(()=>"?").join(","),r=t.nowEpoch??Date.now(),o=[...e],i=`project IN (${s})`;return t.windowDays>0&&(i+=" AND created_at_epoch >= ?",o.push(r-t.windowDays*864e5)),o.push(t.scanLimit),n.prepare(`SELECT tool_name, target, verb, content_session_id, created_at_epoch
       FROM mutations
       WHERE ${i}
       ORDER BY created_at_epoch DESC
       LIMIT ?`).all(...o)}function Ts(n,e=100){let t=n.replace(/\s+/g," ").trim();return t.length>e?t.slice(0,e-1).trimEnd()+"\u2026":t}function fs(n){let e=n.split(`
`)[0],t;do t=e,e=e.replace(/^@"[^"]*"\s*/,"").replace(/^@\S+\s+/,"").replace(/^\/[a-z0-9:_-]+\s+/i,"").trimStart();while(e!==t);return e.trim()}function Ss(n,e){let t=new Map;if(e.length===0)return t;let s=e.map(()=>"?").join(",");try{let r=n.prepare(`SELECT sk.content_session_id AS csid,
                sk.custom_title AS custom_title,
                sk.user_prompt  AS user_prompt,
                (SELECT ss.completed FROM session_summaries ss
                   WHERE ss.memory_session_id = sk.memory_session_id
                     AND ss.completed IS NOT NULL
                     AND length(trim(ss.completed)) >= 25
                     AND lower(ss.completed) NOT LIKE '%noop%'
                     AND lower(ss.completed) NOT LIKE '%trivial%'
                   ORDER BY ss.created_at_epoch DESC LIMIT 1) AS completed,
                (SELECT ss.request FROM session_summaries ss
                   WHERE ss.memory_session_id = sk.memory_session_id
                     AND ss.request IS NOT NULL
                   ORDER BY ss.created_at_epoch DESC LIMIT 1) AS request
         FROM sdk_sessions sk
         WHERE sk.content_session_id IN (${s})`).all(...e);for(let o of r){let i=o.custom_title?.trim()||""||o.completed?.trim()||""||o.request?.trim()||""||o.user_prompt?.trim()||"";i&&t.set(o.csid,Ts(fs(i)))}}catch{}return t}function hs(n,e){let t=["## Recent changes (durable mutations)",""],s="",r=new Set,o=0;for(let i of n){if(o>=e.maxBlocks)break;let a=Q(i.created_at_epoch);a!==s&&(t.push(`### ${a}`),s=a,r.clear());let d=i.verb??i.tool_name.toLowerCase(),_=Be(i.target),u=`${d}::${_}`;r.has(u)||(r.add(u),t.push(`- ${d}: ${_||"(external)"}`),o++)}return t.push(""),t}function bs(n,e,t){let s=new Map;for(let d of e){let _=s.get(d.content_session_id);_?_.push(d):s.set(d.content_session_id,[d])}let r=[...s.values()].map(d=>({csid:d[0].content_session_id,rs:d,latest:d[0].created_at_epoch})).sort((d,_)=>_.latest-d.latest).slice(0,t.maxBlocks),o=t.describe?Ss(n,r.map(d=>d.csid)):new Map,i=["## Recent work (by session)",""],a="";for(let{csid:d,rs:_,latest:u}of r){let g=Q(u);g!==a&&(i.push(`### ${g}`),a=g);let{label:p,otherAreas:E}=Es(_),f=qe(_).join(", "),b=E>0?` +${E} area${E>1?"s":""}`:"",m=`${_.length} change${_.length>1?"s":""} (${f})${b}`,{shown:A,extra:h}=Ye(_,t.filesPerBlock),S=h>0?` +${h} more`:"",R=A.length>0?A.join(", ")+S:"",I=o.get(d);if(I){i.push(`- ${p}: ${I}`);let H=R?`${m} \xB7 ${R}`:m;i.push(`  ${H}`)}else i.push(`- ${p} \u2014 ${m}`),R&&i.push(`  ${R}`)}return i.push(""),i}function Os(n,e){let t=new Map;for(let i of n){let a=Ve(i.target)||"misc",d=t.get(a);d?d.push(i):t.set(a,[i])}let s=[...t.entries()].map(([i,a])=>({label:i,rs:a,latest:a[0].created_at_epoch})).sort((i,a)=>a.rs.length-i.rs.length||a.latest-i.latest).slice(0,e.maxBlocks),o=[`## Recent changes by area${e.windowDays>0?` (last ${e.windowDays} days)`:""}`,""];for(let{label:i,rs:a}of s){let d=qe(a).join(", "),_=a[0].created_at_epoch,u=a[a.length-1].created_at_epoch,g=Q(_)===Q(u)?Te(_):`${Te(u)}\u2192${Te(_)}`;o.push(`- ${i} \u2014 ${a.length} change${a.length>1?"s":""} \xB7 ${d} \xB7 ${g}`);let{shown:p,extra:E}=Ye(a,e.filesPerBlock);if(p.length>0){let f=E>0?` +${E} more`:"";o.push(`  ${p.join(", ")}${f}`)}}return o.push(""),o}function Ke(n,e,t={}){if(e.length===0)return[];let s={...ls,...t},r=gs(n,e,s);if(r.length===0)return[];switch(s.group){case"flat":return hs(r,s);case"topic":return Os(r,s);default:return bs(n,r,s)}}function Je(){let n=new Date,e=n.toLocaleDateString("en-CA"),t=n.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=n.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function Qe(n){return[`# [${n}] recent context, ${Je()}`,""]}function ze(){return[`Legend: \u{1F3AF}session ${C.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji}${t.id}`).join(" ")}`,"Format: ID TIME TYPE TITLE","Fetch details: get_observations([IDs]) | Search: mem-search skill",""]}function Ze(){return[]}function et(){return[]}function tt(n,e){let t=[],s=[`${n.totalObservations} obs (${n.totalReadTokens.toLocaleString()}t read)`,`${n.totalDiscoveryTokens.toLocaleString()}t work`];return n.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)&&(e.showSavingsPercent?s.push(`${n.savingsPercent}% savings`):e.showSavingsAmount&&s.push(`${n.savings.toLocaleString()}t saved`)),t.push(`Stats: ${s.join(" | ")}`),t.push(""),t}function st(n){return[`### ${n}`]}function nt(n){return n.toLowerCase().replace(" am","a").replace(" pm","p")}function rt(n,e,t){let s=n.title||"Untitled",r=C.getInstance().getTypeIcon(n.type),o=e?nt(e):'"';return`${n.id} ${o} ${r} ${s}`}function ot(n,e,t,s){let r=[],o=n.title||"Untitled",i=C.getInstance().getTypeIcon(n.type),a=e?nt(e):'"',{readTokens:d,discoveryDisplay:_}=F(n,s);r.push(`**${n.id}** ${a} ${i} **${o}**`),t&&r.push(t);let u=[];return s.showReadTokens&&u.push(`~${d}t`),s.showWorkTokens&&u.push(_),u.length>0&&r.push(u.join(" ")),r.push(""),r}function it(n,e){return[`S${n.id} ${n.request||"Session started"} (${e})`]}function P(n,e){return e?[`**${n}**: ${e}`,""]:[]}function at(n){return n.assistantMessage?["","---","","**Previously**","",`A: ${n.assistantMessage}`,""]:[]}function dt(n,e){return["",`Access ${Math.round(n/1e3)}k tokens of past work via get_observations([IDs]) or mem-search skill.`]}function _t(n){return`# [${n}] recent context, ${Je()}

No previous sessions found.`}function ct(){let n=new Date,e=n.toLocaleDateString("en-CA"),t=n.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=n.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function ut(n){return["",`${c.bright}${c.cyan}[${n}] recent context, ${ct()}${c.reset}`,`${c.gray}${"\u2500".repeat(60)}${c.reset}`,""]}function lt(){let e=C.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji} ${t.id}`).join(" | ");return[`${c.dim}Legend: session-request | ${e}${c.reset}`,""]}function mt(){return[`${c.bright}Column Key${c.reset}`,`${c.dim}  Read: Tokens to read this observation (cost to learn it now)${c.reset}`,`${c.dim}  Work: Tokens spent on work that produced this record ( research, building, deciding)${c.reset}`,""]}function pt(){return[`${c.dim}Context Index: This semantic index (titles, types, files, tokens) is usually sufficient to understand past work.${c.reset}`,"",`${c.dim}When you need implementation details, rationale, or debugging context:${c.reset}`,`${c.dim}  - Fetch by ID: get_observations([IDs]) for observations visible in this index${c.reset}`,`${c.dim}  - Search history: Use the mem-search skill for past decisions, bugs, and deeper research${c.reset}`,`${c.dim}  - Trust this index over re-reading code for past decisions and learnings${c.reset}`,""]}function Et(n,e){let t=[];if(t.push(`${c.bright}${c.cyan}Context Economics${c.reset}`),t.push(`${c.dim}  Loading: ${n.totalObservations} observations (${n.totalReadTokens.toLocaleString()} tokens to read)${c.reset}`),t.push(`${c.dim}  Work investment: ${n.totalDiscoveryTokens.toLocaleString()} tokens spent on research, building, and decisions${c.reset}`),n.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)){let s="  Your savings: ";e.showSavingsAmount&&e.showSavingsPercent?s+=`${n.savings.toLocaleString()} tokens (${n.savingsPercent}% reduction from reuse)`:e.showSavingsAmount?s+=`${n.savings.toLocaleString()} tokens`:s+=`${n.savingsPercent}% reduction from reuse`,t.push(`${c.green}${s}${c.reset}`)}return t.push(""),t}function gt(n){return[`${c.bright}${c.cyan}${n}${c.reset}`,""]}function Tt(n){return[`${c.dim}${n}${c.reset}`]}function ft(n,e,t,s){let r=n.title||"Untitled",o=C.getInstance().getTypeIcon(n.type),{readTokens:i,discoveryTokens:a,workEmoji:d}=F(n,s),_=t?`${c.dim}${e}${c.reset}`:" ".repeat(e.length),u=s.showReadTokens&&i>0?`${c.dim}(~${i}t)${c.reset}`:"",g=s.showWorkTokens&&a>0?`${c.dim}(${d} ${a.toLocaleString()}t)${c.reset}`:"";return`  ${c.dim}#${n.id}${c.reset}  ${_}  ${o}  ${r} ${u} ${g}`}function St(n,e,t,s,r){let o=[],i=n.title||"Untitled",a=C.getInstance().getTypeIcon(n.type),{readTokens:d,discoveryTokens:_,workEmoji:u}=F(n,r),g=t?`${c.dim}${e}${c.reset}`:" ".repeat(e.length),p=r.showReadTokens&&d>0?`${c.dim}(~${d}t)${c.reset}`:"",E=r.showWorkTokens&&_>0?`${c.dim}(${u} ${_.toLocaleString()}t)${c.reset}`:"";return o.push(`  ${c.dim}#${n.id}${c.reset}  ${g}  ${a}  ${c.bright}${i}${c.reset}`),s&&o.push(`    ${c.dim}${s}${c.reset}`),(p||E)&&o.push(`    ${p} ${E}`),o.push(""),o}function ht(n,e){let t=`${n.request||"Session started"} (${e})`;return[`${c.yellow}#S${n.id}${c.reset} ${t}`,""]}function G(n,e,t){return e?[`${t}${n}:${c.reset} ${e}`,""]:[]}function bt(n){return n.assistantMessage?["","---","",`${c.bright}${c.magenta}Previously${c.reset}`,"",`${c.dim}A: ${n.assistantMessage}${c.reset}`,""]:[]}function Ot(n,e){let t=Math.round(n/1e3);return["",`${c.dim}Access ${t}k tokens of past research & decisions for just ${e.toLocaleString()}t. Use the claude-mem skill to access memories by ID.${c.reset}`]}function Rt(n){return`
${c.bright}${c.cyan}[${n}] recent context, ${ct()}${c.reset}
${c.gray}${"\u2500".repeat(60)}${c.reset}

${c.dim}No previous sessions found for this project yet.${c.reset}
`}function At(n,e,t,s){let r=[];return s?r.push(...ut(n)):r.push(...Qe(n)),s?r.push(...lt()):r.push(...ze()),s?r.push(...mt()):r.push(...Ze()),s?r.push(...pt()):r.push(...et()),K(t)&&(s?r.push(...Et(e,t)):r.push(...tt(e,t))),r}var fe=U(require("path"),1);function ee(n){if(!n)return[];try{let e=JSON.parse(n);return Array.isArray(e)?e:[]}catch(e){return l.debug("PARSER","Failed to parse JSON array, using empty fallback",{preview:n?.substring(0,50)},e instanceof Error?e:new Error(String(e))),[]}}function Se(n){return new Date(n).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:!0})}function he(n){return new Date(n).toLocaleString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})}function Ct(n){return new Date(n).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric"})}function Nt(n,e){return fe.default.isAbsolute(n)?fe.default.relative(e,n):n}function It(n,e,t){let s=ee(n);if(s.length>0)return Nt(s[0],e);if(t){let r=ee(t);if(r.length>0)return Nt(r[0],e)}return"General"}function Rs(n){let e=new Map;for(let s of n){let r=s.type==="observation"?s.data.created_at:s.data.displayTime,o=Ct(r);e.has(o)||e.set(o,[]),e.get(o).push(s)}let t=Array.from(e.entries()).sort((s,r)=>{let o=new Date(s[0]).getTime(),i=new Date(r[0]).getTime();return o-i});return new Map(t)}function Lt(n,e){return e.fullObservationField==="narrative"?n.narrative:n.facts?ee(n.facts).join(`
`):null}function As(n,e,t,s){let r=[];r.push(...st(n));let o="";for(let i of e)if(i.type==="summary"){let a=i.data,d=Se(a.displayTime);r.push(...it(a,d))}else{let a=i.data,d=he(a.created_at),u=d!==o?d:"";if(o=d,t.has(a.id)){let p=Lt(a,s);r.push(...ot(a,u,p,s))}else r.push(rt(a,u,s))}return r}function Ns(n,e,t,s,r){let o=[];o.push(...gt(n));let i=null,a="";for(let d of e)if(d.type==="summary"){i=null,a="";let _=d.data,u=Se(_.displayTime);o.push(...ht(_,u))}else{let _=d.data,u=It(_.files_modified,r,_.files_read),g=he(_.created_at),p=g!==a;a=g;let E=t.has(_.id);if(u!==i&&(o.push(...Tt(u)),i=u),E){let f=Lt(_,s);o.push(...St(_,g,p,f,s))}else o.push(ft(_,g,p,s))}return o.push(""),o}function Cs(n,e,t,s,r,o){return o?Ns(n,e,t,s,r):As(n,e,t,s)}function Dt(n,e,t,s,r){let o=[],i=Rs(n);for(let[a,d]of i)o.push(...Cs(a,d,e,t,s,r));return o}function Mt(n,e,t){return!(!n.showLastSummary||!e||!!!(e.investigated||e.learned||e.completed||e.next_steps)||t&&e.created_at_epoch<=t.created_at_epoch)}function yt(n,e){let t=[];return e?(t.push(...G("Investigated",n.investigated,c.blue)),t.push(...G("Learned",n.learned,c.yellow)),t.push(...G("Completed",n.completed,c.green)),t.push(...G("Next Steps",n.next_steps,c.magenta))):(t.push(...P("Investigated",n.investigated)),t.push(...P("Learned",n.learned)),t.push(...P("Completed",n.completed)),t.push(...P("Next Steps",n.next_steps))),t}function vt(n,e){return e?bt(n):at(n)}function Ut(n,e,t){return!K(e)||n.totalDiscoveryTokens<=0||n.savings<=0?[]:t?Ot(n.totalDiscoveryTokens,n.totalReadTokens):dt(n.totalDiscoveryTokens,n.totalReadTokens)}var Is=wt.default.join((0,xt.homedir)(),".claude","plugins","marketplaces","cafesean","plugin",".install-version");function Ls(){try{return new V}catch(n){if(n instanceof Error&&n.code==="ERR_DLOPEN_FAILED"){try{(0,kt.unlinkSync)(Is)}catch(e){e instanceof Error?l.debug("WORKER","Marker file cleanup failed (may not exist)",{},e):l.debug("WORKER","Marker file cleanup failed (may not exist)",{error:String(e)})}return l.error("WORKER","Native module rebuild needed - restart Claude Code to auto-fix"),null}throw n}}function Ds(n,e){return e?Rt(n):_t(n)}function $t(){return process.env.CLAUDE_MEM_INJECT_MODE==="legacy"?"legacy":"mutations"}function be(n,e){return Number.isFinite(n)?n:e}function Ms(n,e,t,s,r,o,i,a,d){let _=[];if($t()==="mutations"){_.push(`# [${n}] recent context, ${new Date().toISOString().slice(0,16).replace("T"," ")}`,"");let h=Ke(a.db,d,{group:s.digestGroup,windowDays:be(s.digestWindowDays,7),maxBlocks:be(s.digestMaxBlocks,10),filesPerBlock:be(s.digestFilesPerBlock,4),describe:s.digestDescribe});return h.length>0?_.push(...h):_.push("_No durable changes recorded yet for this project._",""),_.push("For deeper recall (past decisions, lessons, specs, session history), use the `recall` skill or `mem-search`."),_.join(`
`).trimEnd()}let u=le(e);_.push(...At(n,u,s,i));let g=t.slice(0,s.sessionCount),p=je(g,t),E=ge(e,p),f=Xe(e,s.fullObservationCount);_.push(...Dt(E,f,s,r,i));let b=t[0],m=e[0];Mt(s,b,m)&&_.push(...yt(b,i));let A=Ee(e,s,o,r);return _.push(...vt(A,i)),_.push(...Ut(u,s,i)),_.join(`
`).trimEnd()}async function Oe(n,e=!1){let t=_e(),s=n?.cwd??process.cwd(),r=oe(s),o=n?.projects?.length?n.projects:r.allProjects,i=o[o.length-1]??r.primary;n?.full&&(t.totalObservationCount=999999,t.sessionCount=999999);let a=Ls();if(!a)return"";try{let d=o.length>1?Ge(a,o,t):me(a,i,t),_=o.length>1?He(a,o,t):pe(a,i,t);return $t()==="legacy"&&d.length===0&&_.length===0?Ds(i,e):Ms(i,d,_,t,s,n?.session_id,e,a,o)}finally{a.close()}}0&&(module.exports={generateContext});
