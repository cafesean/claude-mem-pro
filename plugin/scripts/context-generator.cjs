"use strict";var zt=Object.create;var V=Object.defineProperty;var Zt=Object.getOwnPropertyDescriptor;var es=Object.getOwnPropertyNames;var ts=Object.getPrototypeOf,ss=Object.prototype.hasOwnProperty;var ns=(n,e)=>{for(var t in e)V(n,t,{get:e[t],enumerable:!0})},Ue=(n,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of es(e))!ss.call(n,r)&&r!==t&&V(n,r,{get:()=>e[r],enumerable:!(s=Zt(e,r))||s.enumerable});return n};var k=(n,e,t)=>(t=n!=null?zt(ts(n)):{},Ue(e||!n||!n.__esModule?V(t,"default",{value:n,enumerable:!0}):t,n)),rs=n=>Ue(V({},"__esModule",{value:!0}),n);var Tn={};ns(Tn,{generateContext:()=>ye});module.exports=rs(Tn);var Kt=k(require("path"),1),qt=require("os"),Jt=require("fs");var Ee=require("bun:sqlite");var T=require("path"),ue=require("os"),v=require("fs");var xe=require("url");var M=require("fs"),we=require("path");var de=(i=>(i[i.DEBUG=0]="DEBUG",i[i.INFO=1]="INFO",i[i.WARN=2]="WARN",i[i.ERROR=3]="ERROR",i[i.SILENT=4]="SILENT",i))(de||{}),ce=class{level=null;useColor;logFilePath=null;logFileInitialized=!1;constructor(){this.useColor=process.stdout.isTTY??!1}ensureLogFileInitialized(){if(!this.logFileInitialized){this.logFileInitialized=!0;try{let e=$.logsDir();(0,M.existsSync)(e)||(0,M.mkdirSync)(e,{recursive:!0});let t=new Date().toISOString().split("T")[0];this.logFilePath=(0,we.join)(e,`claude-mem-${t}.log`)}catch(e){console.error("[LOGGER] Failed to initialize log file:",e instanceof Error?e.message:String(e)),this.logFilePath=null}}}getLevel(){if(this.level===null)try{let e=$.settings();if((0,M.existsSync)(e)){let t=(0,M.readFileSync)(e,"utf-8"),r=(JSON.parse(t).CLAUDE_MEM_LOG_LEVEL||"INFO").toUpperCase();this.level=de[r]??1}else this.level=1}catch(e){console.error("[LOGGER] Failed to load log level from settings:",e instanceof Error?e.message:String(e)),this.level=1}return this.level}correlationId(e,t){return`obs-${e}-${t}`}sessionId(e){return`session-${e}`}formatData(e){if(e==null)return"";if(typeof e=="string")return e;if(typeof e=="number"||typeof e=="boolean")return e.toString();if(typeof e=="object"){if(e instanceof Error)return this.getLevel()===0?`${e.message}
${e.stack}`:e.message;if(Array.isArray(e))return`[${e.length} items]`;let t=Object.keys(e);return t.length===0?"{}":t.length<=3?JSON.stringify(e):`{${t.length} keys: ${t.slice(0,3).join(", ")}...}`}return String(e)}formatTool(e,t){if(!t)return e;let s=t;if(typeof t=="string")try{s=JSON.parse(t)}catch{s=t}if(e==="Bash"&&s.command)return`${e}(${s.command})`;if(s.file_path)return`${e}(${s.file_path})`;if(s.notebook_path)return`${e}(${s.notebook_path})`;if(e==="Glob"&&s.pattern)return`${e}(${s.pattern})`;if(e==="Grep"&&s.pattern)return`${e}(${s.pattern})`;if(s.url)return`${e}(${s.url})`;if(s.query)return`${e}(${s.query})`;if(e==="Task"){if(s.subagent_type)return`${e}(${s.subagent_type})`;if(s.description)return`${e}(${s.description})`}return e==="Skill"&&s.skill?`${e}(${s.skill})`:e==="LSP"&&s.operation?`${e}(${s.operation})`:e}formatTimestamp(e){let t=e.getFullYear(),s=String(e.getMonth()+1).padStart(2,"0"),r=String(e.getDate()).padStart(2,"0"),i=String(e.getHours()).padStart(2,"0"),o=String(e.getMinutes()).padStart(2,"0"),a=String(e.getSeconds()).padStart(2,"0"),d=String(e.getMilliseconds()).padStart(3,"0");return`${t}-${s}-${r} ${i}:${o}:${a}.${d}`}log(e,t,s,r,i){if(e<this.getLevel())return;this.ensureLogFileInitialized();let o=this.formatTimestamp(new Date),a=de[e].padEnd(5),d=t.padEnd(6),c="";r?.correlationId?c=`[${r.correlationId}] `:r?.sessionId&&(c=`[session-${r.sessionId}] `);let u="";if(i!=null)if(i instanceof Error)u=this.getLevel()===0?`
${i.message}
${i.stack}`:` ${i.message}`;else if(this.getLevel()===0&&typeof i=="object")try{u=`
`+JSON.stringify(i,null,2)}catch{u=" "+this.formatData(i)}else u=" "+this.formatData(i);let g="";if(r){let{sessionId:E,memorySessionId:f,correlationId:O,...p}=r;Object.keys(p).length>0&&(g=` {${Object.entries(p).map(([b,S])=>`${b}=${S}`).join(", ")}}`)}let m=`[${o}] [${a}] [${d}] ${c}${s}${g}${u}`;if(this.logFilePath)try{(0,M.appendFileSync)(this.logFilePath,m+`
`,"utf8")}catch(E){process.stderr.write(`[LOGGER] Failed to write to log file: ${E instanceof Error?E.message:String(E)}
`)}else process.stderr.write(m+`
`)}debug(e,t,s,r){this.log(0,e,t,s,r)}info(e,t,s,r){this.log(1,e,t,s,r)}warn(e,t,s,r){this.log(2,e,t,s,r)}error(e,t,s,r){this.log(3,e,t,s,r)}dataIn(e,t,s,r){this.info(e,`\u2192 ${t}`,s,r)}dataOut(e,t,s,r){this.info(e,`\u2190 ${t}`,s,r)}success(e,t,s,r){this.info(e,`\u2713 ${t}`,s,r)}failure(e,t,s,r){this.error(e,`\u2717 ${t}`,s,r)}timing(e,t,s,r){this.info(e,`\u23F1 ${t}`,r,{duration:`${s}ms`})}happyPathError(e,t,s,r,i=""){let c=((new Error().stack||"").split(`
`)[2]||"").match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/),u=c?`${c[1].split("/").pop()}:${c[2]}`:"unknown",g={...s,location:u};return this.warn(e,`[HAPPY-PATH] ${t}`,g,r),i}},l=new ce;var ms={};function is(){return typeof __dirname<"u"?__dirname:(0,T.dirname)((0,xe.fileURLToPath)(ms.url))}var os=is();function as(){if(process.env.CLAUDE_MEM_DATA_DIR)return process.env.CLAUDE_MEM_DATA_DIR;let n=(0,T.join)((0,ue.homedir)(),".claude-mem"),e=(0,T.join)(n,"settings.json");try{if((0,v.existsSync)(e)){let t=JSON.parse((0,v.readFileSync)(e,"utf-8")),s=t.env??t;if(s.CLAUDE_MEM_DATA_DIR)return s.CLAUDE_MEM_DATA_DIR}}catch{}return n}var R=as(),U=process.env.CLAUDE_CONFIG_DIR||(0,T.join)((0,ue.homedir)(),".claude"),Rn=(0,T.join)(U,"plugins","marketplaces","cafesean"),ds=(0,T.join)(R,"archives"),cs=(0,T.join)(R,"logs"),us=(0,T.join)(R,"trash"),_s=(0,T.join)(R,"backups"),ls=(0,T.join)(R,"modes"),An=(0,T.join)(R,"settings.json"),ke=(0,T.join)(R,"claude-mem.db"),ps=(0,T.join)(R,"vector-db"),$e=(0,T.join)(R,"observer-sessions"),_e=(0,T.basename)($e),Nn=(0,T.join)(U,"settings.json"),Cn=(0,T.join)(U,"commands"),In=(0,T.join)(U,"CLAUDE.md");function Fe(n){(0,v.mkdirSync)(n,{recursive:!0})}function Pe(){return(0,T.join)(os,"..")}var $={dataDir:()=>R,workerPid:()=>(0,T.join)(R,"worker.pid"),serverBetaPid:()=>(0,T.join)(R,".server-beta.pid"),serverBetaPort:()=>(0,T.join)(R,".server-beta.port"),serverBetaRuntime:()=>(0,T.join)(R,".server-beta.runtime.json"),settings:()=>(0,T.join)(R,"settings.json"),database:()=>(0,T.join)(R,"claude-mem.db"),chroma:()=>(0,T.join)(R,"chroma"),combinedCerts:()=>(0,T.join)(R,"combined_certs.pem"),transcriptsConfig:()=>(0,T.join)(R,"transcript-watch.json"),transcriptsState:()=>(0,T.join)(R,"transcript-watch-state.json"),corpora:()=>(0,T.join)(R,"corpora"),supervisorRegistry:()=>(0,T.join)(R,"supervisor.json"),envFile:()=>(0,T.join)(R,".env"),logsDir:()=>cs,archives:()=>ds,trash:()=>us,backups:()=>_s,modes:()=>ls,vectorDb:()=>ps,observerSessions:()=>$e};var Xe=require("crypto");var je=require("os"),Ge=k(require("path"),1);var q=require("fs"),K=k(require("path"),1),F={isWorktree:!1,worktreeName:null,parentRepoPath:null,parentProjectName:null};function J(n){let e=K.default.join(n,".git"),t;try{t=(0,q.statSync)(e)}catch(u){return u instanceof Error&&u.code!=="ENOENT"&&console.warn("[worktree] Unexpected error checking .git:",u),F}if(!t.isFile())return F;let s;try{s=(0,q.readFileSync)(e,"utf-8").trim()}catch(u){return console.warn("[worktree] Failed to read .git file:",u instanceof Error?u.message:String(u)),F}let r=s.match(/^gitdir:\s*(.+)$/);if(!r)return F;let o=r[1].match(/^(.+)[/\\]\.git[/\\]worktrees[/\\]([^/\\]+)$/);if(!o)return F;let a=o[1],d=K.default.basename(n),c=K.default.basename(a);return{isWorktree:!0,worktreeName:d,parentRepoPath:a,parentProjectName:c}}function He(n){return n==="~"||n.startsWith("~/")?n.replace(/^~/,(0,je.homedir)()):n}function le(n){if(!n||n.trim()==="")return l.warn("PROJECT_NAME","Empty cwd provided, using fallback",{cwd:n}),"unknown-project";let e=He(n),t=Ge.default.basename(e);if(t===""){if(process.platform==="win32"){let r=n.match(/^([A-Z]):\\/i);if(r){let o=`drive-${r[1].toUpperCase()}`;return l.info("PROJECT_NAME","Drive root detected",{cwd:n,projectName:o}),o}}return l.warn("PROJECT_NAME","Root directory detected, using fallback",{cwd:n}),"unknown-project"}return t}function pe(n){let e=le(n);if(!n)return{primary:e,parent:null,isWorktree:!1,allProjects:[e]};let t=He(n),s=J(t);if(s.isWorktree&&s.parentProjectName){let r=`${s.parentProjectName}/${e}`;return{primary:r,parent:s.parentProjectName,isWorktree:!0,allProjects:[s.parentProjectName,r]}}return{primary:e,parent:null,isWorktree:!1,allProjects:[e]}}function Q(n,e,t){return(0,Xe.createHash)("sha256").update([n||"",e||"",t||""].join("\0")).digest("hex").slice(0,16)}function me(n){if(!n)return[];try{let e=JSON.parse(n);return Array.isArray(e)?e:[String(e)]}catch{return[n]}}var C="claude";function Es(n){return n.trim().toLowerCase().replace(/\s+/g,"-")}function w(n){if(!n)return C;let e=Es(n);return e?e==="transcript"||e.includes("codex")?"codex":e.includes("cursor")?"cursor":e.includes("claude")?"claude":e:C}function Be(n){let e=["claude","codex","cursor"];return[...n].sort((t,s)=>{let r=e.indexOf(t),i=e.indexOf(s);return r!==-1||i!==-1?r===-1?1:i===-1?-1:r-i:t.localeCompare(s)})}function gs(n,e){return{customTitle:n,platformSource:e?w(e):void 0}}var z=class{db;constructor(e=ke){e instanceof Ee.Database?this.db=e:(e!==":memory:"&&Fe(R),this.db=new Ee.Database(e),this.db.run("PRAGMA journal_mode = WAL"),this.db.run("PRAGMA synchronous = NORMAL"),this.db.run("PRAGMA foreign_keys = ON"),this.db.run("PRAGMA journal_size_limit = 4194304")),this.initializeSchema(),this.ensureWorkerPortColumn(),this.ensurePromptTrackingColumns(),this.removeSessionSummariesUniqueConstraint(),this.addObservationHierarchicalFields(),this.makeObservationsTextNullable(),this.createUserPromptsTable(),this.ensureDiscoveryTokensColumn(),this.createPendingMessagesTable(),this.renameSessionIdColumns(),this.repairSessionIdColumnRename(),this.addFailedAtEpochColumn(),this.addOnUpdateCascadeToForeignKeys(),this.addObservationContentHashColumn(),this.addSessionCustomTitleColumn(),this.addSessionPlatformSourceColumn(),this.addObservationModelColumns(),this.ensureMergedIntoProjectColumns(),this.addObservationSubagentColumns(),this.addObservationsUniqueContentHashIndex(),this.addObservationsMetadataColumn(),this.dropDeadPendingMessagesColumns(),this.ensurePendingMessagesToolUseIdColumn(),this.dropWorkerPidColumn()}dropWorkerPidColumn(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(32),s=this.db.query("PRAGMA table_info(pending_messages)").all().some(r=>r.name==="worker_pid");if(!(e&&!s)){if(s)try{this.db.run("DROP INDEX IF EXISTS idx_pending_messages_worker_pid"),this.db.run("ALTER TABLE pending_messages DROP COLUMN worker_pid"),l.debug("DB","Dropped worker_pid column and its index from pending_messages")}catch(r){l.warn("DB","Failed to drop worker_pid column from pending_messages",{},r instanceof Error?r:new Error(String(r)));return}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(32,new Date().toISOString())}}dropDeadPendingMessagesColumns(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(31),t=this.db.query("PRAGMA table_info(pending_messages)").all(),s=new Set(t.map(o=>o.name)),i=["retry_count","failed_at_epoch","completed_at_epoch"].filter(o=>s.has(o));if(!(e&&i.length===0)){if(i.length>0){this.db.run("BEGIN TRANSACTION");try{this.db.run("DELETE FROM pending_messages WHERE status NOT IN ('pending', 'processing')");for(let o of i)this.db.run(`ALTER TABLE pending_messages DROP COLUMN ${o}`),l.debug("DB",`Dropped dead column ${o} from pending_messages`);e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(31,new Date().toISOString()),this.db.run("COMMIT")}catch(o){this.db.run("ROLLBACK"),l.warn("DB","Failed to drop dead columns from pending_messages",{},o instanceof Error?o:new Error(String(o)));return}return}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(31,new Date().toISOString())}}initializeSchema(){this.db.run(`
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
    `;try{this.db.run(s),this.db.run(r)}catch(i){i instanceof Error?l.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},i):l.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},new Error(String(i))),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),l.debug("DB","Created user_prompts table (without FTS5)");return}this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),l.debug("DB","Successfully created user_prompts table")}ensureDiscoveryTokensColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(11))return;this.db.query("PRAGMA table_info(observations)").all().some(o=>o.name==="discovery_tokens")||(this.db.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),l.debug("DB","Added discovery_tokens column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(o=>o.name==="discovery_tokens")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),l.debug("DB","Added discovery_tokens column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(11,new Date().toISOString())}createPendingMessagesTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(16))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString());return}l.debug("DB","Creating pending_messages table"),this.db.run(`
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
    `),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_session ON pending_messages(session_db_id)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_status ON pending_messages(status)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_claude_session ON pending_messages(content_session_id)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString()),l.debug("DB","pending_messages table created successfully")}renameSessionIdColumns(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(17))return;l.debug("DB","Checking session ID columns for semantic clarity rename");let t=0,s=(r,i,o)=>{let a=this.db.query(`PRAGMA table_info(${r})`).all(),d=a.some(u=>u.name===i);return a.some(u=>u.name===o)?!1:d?(this.db.run(`ALTER TABLE ${r} RENAME COLUMN ${i} TO ${o}`),l.debug("DB",`Renamed ${r}.${i} to ${o}`),!0):(l.warn("DB",`Column ${i} not found in ${r}, skipping rename`),!1)};s("sdk_sessions","claude_session_id","content_session_id")&&t++,s("sdk_sessions","sdk_session_id","memory_session_id")&&t++,s("pending_messages","claude_session_id","content_session_id")&&t++,s("observations","sdk_session_id","memory_session_id")&&t++,s("session_summaries","sdk_session_id","memory_session_id")&&t++,s("user_prompts","claude_session_id","content_session_id")&&t++,this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(17,new Date().toISOString()),t>0?l.debug("DB",`Successfully renamed ${t} session ID columns`):l.debug("DB","No session ID column renames needed (already up to date)")}repairSessionIdColumnRename(){this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(19)||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(19,new Date().toISOString())}addFailedAtEpochColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(20))return;this.db.query("PRAGMA table_info(pending_messages)").all().some(r=>r.name==="failed_at_epoch")||(this.db.run("ALTER TABLE pending_messages ADD COLUMN failed_at_epoch INTEGER"),l.debug("DB","Added failed_at_epoch column to pending_messages table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(20,new Date().toISOString())}addOnUpdateCascadeToForeignKeys(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(21))return;l.debug("DB","Adding ON UPDATE CASCADE to FK constraints on observations and session_summaries"),this.db.run("PRAGMA foreign_keys = OFF"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TRIGGER IF EXISTS observations_ai"),this.db.run("DROP TRIGGER IF EXISTS observations_ad"),this.db.run("DROP TRIGGER IF EXISTS observations_au"),this.db.run("DROP TABLE IF EXISTS observations_new");let s=this.db.query("PRAGMA table_info(observations)").all().some(f=>f.name==="metadata"),r=s?`,
        metadata TEXT`:"",i=s?", metadata":"",o=`
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
             discovery_tokens, created_at, created_at_epoch${i}
      FROM observations
    `,d=`
      CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX idx_observations_project ON observations(project);
      CREATE INDEX idx_observations_type ON observations(type);
      CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
    `,c=`
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
    `,m=`
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
    `;try{this.recreateObservationsWithCascade(o,a,d,c),this.recreateSessionSummariesWithCascade(u,g,m,E),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(21,new Date().toISOString()),this.db.run("COMMIT"),this.db.run("PRAGMA foreign_keys = ON"),l.debug("DB","Successfully added ON UPDATE CASCADE to FK constraints")}catch(f){throw this.db.run("ROLLBACK"),this.db.run("PRAGMA foreign_keys = ON"),f instanceof Error?f:new Error(String(f))}}recreateObservationsWithCascade(e,t,s,r){this.db.run(e),this.db.run(t),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(s),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'").all().length>0&&this.db.run(r)}recreateSessionSummariesWithCascade(e,t,s,r){this.db.run(e),this.db.run(t),this.db.run("DROP TABLE session_summaries"),this.db.run("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.run(s),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_summaries_fts'").all().length>0&&this.db.run(r)}addObservationContentHashColumn(){if(this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="content_hash")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString());return}this.db.run("ALTER TABLE observations ADD COLUMN content_hash TEXT"),this.db.run("UPDATE observations SET content_hash = substr(hex(randomblob(8)), 1, 16) WHERE content_hash IS NULL"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_content_hash ON observations(content_hash, created_at_epoch)"),l.debug("DB","Added content_hash column to observations table with backfill and index"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString())}addSessionCustomTitleColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(23))return;this.db.query("PRAGMA table_info(sdk_sessions)").all().some(r=>r.name==="custom_title")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN custom_title TEXT"),l.debug("DB","Added custom_title column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(23,new Date().toISOString())}addSessionPlatformSourceColumn(){let t=this.db.query("PRAGMA table_info(sdk_sessions)").all().some(o=>o.name==="platform_source"),r=this.db.query("PRAGMA index_list(sdk_sessions)").all().some(o=>o.name==="idx_sdk_sessions_platform_source");this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(24)&&t&&r||(t||(this.db.run(`ALTER TABLE sdk_sessions ADD COLUMN platform_source TEXT NOT NULL DEFAULT '${C}'`),l.debug("DB","Added platform_source column to sdk_sessions table")),this.db.run(`
      UPDATE sdk_sessions
      SET platform_source = '${C}'
      WHERE platform_source IS NULL OR platform_source = ''
    `),r||this.db.run("CREATE INDEX IF NOT EXISTS idx_sdk_sessions_platform_source ON sdk_sessions(platform_source)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(24,new Date().toISOString()))}addObservationModelColumns(){let e=this.db.query("PRAGMA table_info(observations)").all(),t=e.some(r=>r.name==="generated_by_model"),s=e.some(r=>r.name==="relevance_count");t&&s||(t||this.db.run("ALTER TABLE observations ADD COLUMN generated_by_model TEXT"),s||this.db.run("ALTER TABLE observations ADD COLUMN relevance_count INTEGER DEFAULT 0"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(26,new Date().toISOString()))}ensureMergedIntoProjectColumns(){this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="merged_into_project")||this.db.run("ALTER TABLE observations ADD COLUMN merged_into_project TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_merged_into ON observations(merged_into_project)"),this.db.query("PRAGMA table_info(session_summaries)").all().some(s=>s.name==="merged_into_project")||this.db.run("ALTER TABLE session_summaries ADD COLUMN merged_into_project TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_summaries_merged_into ON session_summaries(merged_into_project)")}addObservationSubagentColumns(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(27),t=this.db.query("PRAGMA table_info(observations)").all(),s=t.some(o=>o.name==="agent_type"),r=t.some(o=>o.name==="agent_id");s||this.db.run("ALTER TABLE observations ADD COLUMN agent_type TEXT"),r||this.db.run("ALTER TABLE observations ADD COLUMN agent_id TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_agent_type ON observations(agent_type)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_agent_id ON observations(agent_id)");let i=this.db.query("PRAGMA table_info(pending_messages)").all();if(i.length>0){let o=i.some(d=>d.name==="agent_type"),a=i.some(d=>d.name==="agent_id");o||this.db.run("ALTER TABLE pending_messages ADD COLUMN agent_type TEXT"),a||this.db.run("ALTER TABLE pending_messages ADD COLUMN agent_id TEXT")}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(27,new Date().toISOString())}ensurePendingMessagesToolUseIdColumn(){if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(28,new Date().toISOString());return}this.db.query("PRAGMA table_info(pending_messages)").all().some(r=>r.name==="tool_use_id")||this.db.run("ALTER TABLE pending_messages ADD COLUMN tool_use_id TEXT"),this.db.run("BEGIN TRANSACTION");try{this.db.run(`
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
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(28,new Date().toISOString()),this.db.run("COMMIT")}catch(r){throw this.db.run("ROLLBACK"),r}}addObservationsUniqueContentHashIndex(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(29))return;let t=this.db.query("PRAGMA table_info(observations)").all(),s=t.some(i=>i.name==="memory_session_id"),r=t.some(i=>i.name==="content_hash");if(!s||!r){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(29,new Date().toISOString());return}this.db.run("BEGIN TRANSACTION");try{this.db.run(`
        DELETE FROM observations
         WHERE id NOT IN (
           SELECT MIN(id) FROM observations
            GROUP BY memory_session_id, content_hash
         )
      `),this.db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS ux_observations_session_hash
        ON observations(memory_session_id, content_hash)
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(29,new Date().toISOString()),this.db.run("COMMIT")}catch(i){throw this.db.run("ROLLBACK"),i}}addObservationsMetadataColumn(){this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="metadata")||(this.db.run("ALTER TABLE observations ADD COLUMN metadata TEXT"),l.debug("DB","Added metadata column to observations table (#2116)")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(30,new Date().toISOString())}updateMemorySessionId(e,t){this.db.prepare(`
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
        COALESCE(s.platform_source, '${C}') as platform_source,
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
        COALESCE(s.platform_source, '${C}') as platform_source,
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
        COALESCE(s.platform_source, '${C}') as platform_source,
        up.prompt_number,
        up.prompt_text,
        up.created_at,
        up.created_at_epoch
      FROM user_prompts up
      LEFT JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      ORDER BY up.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllProjects(e){let t=e?w(e):void 0,s=`
      SELECT DISTINCT project
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
        AND project != ?
    `,r=[_e];return t&&(s+=" AND COALESCE(platform_source, ?) = ?",r.push(C,t)),s+=" ORDER BY project ASC",this.db.prepare(s).all(...r).map(o=>o.project)}getProjectCatalog(){let e=this.db.prepare(`
      SELECT
        COALESCE(platform_source, '${C}') as platform_source,
        project,
        MAX(started_at_epoch) as latest_epoch
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
        AND project != ?
      GROUP BY COALESCE(platform_source, '${C}'), project
      ORDER BY latest_epoch DESC
    `).all(_e),t=[],s=new Set,r={};for(let o of e){let a=w(o.platform_source);r[a]||(r[a]=[]),r[a].includes(o.project)||r[a].push(o.project),s.has(o.project)||(s.add(o.project),t.push(o.project))}let i=Be(Object.keys(r));return{projects:t,sources:i,projectsBySource:Object.fromEntries(i.map(o=>[o,r[o]||[]]))}}getLatestUserPrompt(e){return this.db.prepare(`
      SELECT
        up.*,
        s.memory_session_id,
        s.project,
        COALESCE(s.platform_source, '${C}') as platform_source
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
    `).get(e)||null}getObservationsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:r,project:i,type:o,concepts:a,files:d}=t,c=s==="relevance",u=c?"":`ORDER BY created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,g=r?`LIMIT ${r}`:"",m=e.map(()=>"?").join(","),E=[...e],f=[];if(i&&(f.push("project = ?"),E.push(i)),o)if(Array.isArray(o)){let S=o.map(()=>"?").join(",");f.push(`type IN (${S})`),E.push(...o)}else f.push("type = ?"),E.push(o);if(a){let S=Array.isArray(a)?a:[a],h=S.map(()=>"EXISTS (SELECT 1 FROM json_each(concepts) WHERE value = ?)");E.push(...S),f.push(`(${h.join(" OR ")})`)}if(d){let S=Array.isArray(d)?d:[d],h=S.map(()=>"(EXISTS (SELECT 1 FROM json_each(files_read) WHERE value LIKE ?) OR EXISTS (SELECT 1 FROM json_each(files_modified) WHERE value LIKE ?))");S.forEach(N=>{E.push(`%${N}%`,`%${N}%`)}),f.push(`(${h.join(" OR ")})`)}let O=f.length>0?`WHERE id IN (${m}) AND ${f.join(" AND ")}`:`WHERE id IN (${m})`,A=this.db.prepare(`
      SELECT *
      FROM observations
      ${O}
      ${u}
      ${g}
    `).all(...E);if(!c)return A;let b=new Map(A.map(S=>[S.id,S]));return e.map(S=>b.get(S)).filter(S=>!!S)}getSummaryForSession(e){return this.db.prepare(`
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
    `).all(e),r=new Set,i=new Set;for(let o of s)me(o.files_read).forEach(a=>r.add(a)),me(o.files_modified).forEach(a=>i.add(a));return{filesRead:Array.from(r),filesModified:Array.from(i)}}getSessionById(e){return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project,
             COALESCE(platform_source, '${C}') as platform_source,
             user_prompt, custom_title, status
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}getSdkSessionsBySessionIds(e){if(e.length===0)return[];let t=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project,
             COALESCE(platform_source, '${C}') as platform_source,
             user_prompt, custom_title,
             started_at, started_at_epoch, completed_at, completed_at_epoch, status
      FROM sdk_sessions
      WHERE memory_session_id IN (${t})
      ORDER BY started_at_epoch DESC
    `).all(...e)}getPromptNumberFromUserPrompts(e){return this.db.prepare(`
      SELECT COUNT(*) as count FROM user_prompts WHERE content_session_id = ?
    `).get(e).count}createSDKSession(e,t,s,r,i){let o=new Date,a=o.getTime(),d=gs(r,i),c=d.platformSource??C,u=this.db.prepare(`
      SELECT id, platform_source FROM sdk_sessions WHERE content_session_id = ?
    `).get(e);if(u){if(t&&this.db.prepare(`
          UPDATE sdk_sessions SET project = ?
          WHERE content_session_id = ? AND (project IS NULL OR project = '')
        `).run(t,e),d.customTitle&&this.db.prepare(`
          UPDATE sdk_sessions SET custom_title = ?
          WHERE content_session_id = ? AND custom_title IS NULL
        `).run(d.customTitle,e),d.platformSource){let m=u.platform_source?.trim()?w(u.platform_source):void 0;if(!m)this.db.prepare(`
            UPDATE sdk_sessions SET platform_source = ?
            WHERE content_session_id = ?
              AND COALESCE(platform_source, '') = ''
          `).run(d.platformSource,e);else if(m!==d.platformSource)throw new Error(`Platform source conflict for session ${e}: existing=${m}, received=${d.platformSource}`)}return u.id}return this.db.prepare(`
      INSERT INTO sdk_sessions
      (content_session_id, memory_session_id, project, platform_source, user_prompt, custom_title, started_at, started_at_epoch, status)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'active')
    `).run(e,t,c,s,d.customTitle||null,o.toISOString(),a),this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e).id}saveUserPrompt(e,t,s){let r=new Date,i=r.getTime();return this.db.prepare(`
      INSERT INTO user_prompts
      (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `).run(e,t,s,r.toISOString(),i).lastInsertRowid}getUserPrompt(e,t){return this.db.prepare(`
      SELECT prompt_text
      FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
      LIMIT 1
    `).get(e,t)?.prompt_text??null}storeObservation(e,t,s,r,i=0,o,a){let d=o??Date.now(),c=new Date(d).toISOString(),u=Q(e,s.title,s.narrative),m=this.db.prepare(`
      INSERT INTO observations
      (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
       files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
       generated_by_model, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_session_id, content_hash) DO NOTHING
      RETURNING id, created_at_epoch
    `).get(e,t,s.type,s.title,s.subtitle,JSON.stringify(s.facts),s.narrative,JSON.stringify(s.concepts),JSON.stringify(s.files_read),JSON.stringify(s.files_modified),r||null,i,s.agent_type??null,s.agent_id??null,u,c,d,a||null,s.metadata??null);if(m)return{id:m.id,createdAtEpoch:m.created_at_epoch};let E=this.db.prepare("SELECT id, created_at_epoch FROM observations WHERE memory_session_id = ? AND content_hash = ?").get(e,u);if(!E)throw new Error(`storeObservation: ON CONFLICT without existing row for content_hash=${u}`);return{id:E.id,createdAtEpoch:E.created_at_epoch}}storeSummary(e,t,s,r,i=0,o){let a=o??Date.now(),d=new Date(a).toISOString(),u=this.db.prepare(`
      INSERT INTO session_summaries
      (memory_session_id, project, request, investigated, learned, completed,
       next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,t,s.request,s.investigated,s.learned,s.completed,s.next_steps,s.notes,r||null,i,d,a);return{id:Number(u.lastInsertRowid),createdAtEpoch:a}}storeObservations(e,t,s,r,i,o=0,a,d){let c=a??Date.now(),u=new Date(c).toISOString();return this.db.transaction(()=>{let m=[],E=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
         generated_by_model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_session_id, content_hash) DO NOTHING
        RETURNING id
      `),f=this.db.prepare("SELECT id FROM observations WHERE memory_session_id = ? AND content_hash = ?");for(let p of s){let A=Q(e,p.title,p.narrative),b=E.get(e,t,p.type,p.title,p.subtitle,JSON.stringify(p.facts),p.narrative,JSON.stringify(p.concepts),JSON.stringify(p.files_read),JSON.stringify(p.files_modified),i||null,o,p.agent_type??null,p.agent_id??null,A,u,c,d||null);if(b){m.push(b.id);continue}let S=f.get(e,A);if(!S)throw new Error(`storeObservations: ON CONFLICT without existing row for content_hash=${A}`);m.push(S.id)}let O=null;if(r){let A=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,r.request,r.investigated,r.learned,r.completed,r.next_steps,r.notes,i||null,o,u,c);O=Number(A.lastInsertRowid)}return{observationIds:m,summaryId:O,createdAtEpoch:c}})()}storeObservationsAndMarkComplete(e,t,s,r,i,o,a,d=0,c,u){let g=c??Date.now(),m=new Date(g).toISOString();return this.db.transaction(()=>{let f=[],O=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
         generated_by_model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_session_id, content_hash) DO NOTHING
        RETURNING id
      `),p=this.db.prepare("SELECT id FROM observations WHERE memory_session_id = ? AND content_hash = ?");for(let h of s){let N=Q(e,h.title,h.narrative),Y=O.get(e,t,h.type,h.title,h.subtitle,JSON.stringify(h.facts),h.narrative,JSON.stringify(h.concepts),JSON.stringify(h.files_read),JSON.stringify(h.files_modified),a||null,d,h.agent_type??null,h.agent_id??null,N,m,g,u||null);if(Y){f.push(Y.id);continue}let ve=p.get(e,N);if(!ve)throw new Error(`storeObservationsAndMarkComplete: ON CONFLICT without existing row for content_hash=${N}`);f.push(ve.id)}let A;if(r){let N=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,r.request,r.investigated,r.learned,r.completed,r.next_steps,r.notes,a||null,d,m,g);A=Number(N.lastInsertRowid)}if(this.db.prepare(`
        DELETE FROM pending_messages
        WHERE id = ? AND status = 'processing'
      `).run(i).changes!==1)throw new Error(`storeObservationsAndMarkComplete: failed to complete pending message ${i}`);return{observationIds:f,summaryId:A,createdAtEpoch:g}})()}getSessionSummariesByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:r,project:i}=t,o=s==="relevance",a=o?"":`ORDER BY created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,d=r?`LIMIT ${r}`:"",c=e.map(()=>"?").join(","),u=[...e],g=i?`WHERE id IN (${c}) AND project = ?`:`WHERE id IN (${c})`;i&&u.push(i);let E=this.db.prepare(`
      SELECT * FROM session_summaries
      ${g}
      ${a}
      ${d}
    `).all(...u);if(!o)return E;let f=new Map(E.map(O=>[O.id,O]));return e.map(O=>f.get(O)).filter(O=>!!O)}getUserPromptsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:r,project:i}=t,o=s==="relevance",a=o?"":`ORDER BY up.created_at_epoch ${s==="date_asc"?"ASC":"DESC"}`,d=r?`LIMIT ${r}`:"",c=e.map(()=>"?").join(","),u=[...e],g=i?"AND s.project = ?":"";i&&u.push(i);let E=this.db.prepare(`
      SELECT
        up.*,
        s.project,
        s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.id IN (${c}) ${g}
      ${a}
      ${d}
    `).all(...u);if(!o)return E;let f=new Map(E.map(O=>[O.id,O]));return e.map(O=>f.get(O)).filter(O=>!!O)}getTimelineAroundTimestamp(e,t=10,s=10,r){return this.getTimelineAroundObservation(null,e,t,s,r)}getTimelineAroundObservation(e,t,s=10,r=10,i){let o=i?"AND project = ?":"",a=i?[i]:[],d,c;if(e!==null){let p=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id <= ? ${o}
        ORDER BY id DESC
        LIMIT ?
      `,A=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id >= ? ${o}
        ORDER BY id ASC
        LIMIT ?
      `;try{let b=this.db.prepare(p).all(e,...a,s+1),S=this.db.prepare(A).all(e,...a,r+1);if(b.length===0&&S.length===0)return{observations:[],sessions:[],prompts:[]};d=b.length>0?b[b.length-1].created_at_epoch:t,c=S.length>0?S[S.length-1].created_at_epoch:t}catch(b){return b instanceof Error?l.error("DB","Error getting boundary observations",{project:i},b):l.error("DB","Error getting boundary observations with non-Error",{},new Error(String(b))),{observations:[],sessions:[],prompts:[]}}}else{let p=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch <= ? ${o}
        ORDER BY created_at_epoch DESC
        LIMIT ?
      `,A=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch >= ? ${o}
        ORDER BY created_at_epoch ASC
        LIMIT ?
      `;try{let b=this.db.prepare(p).all(t,...a,s),S=this.db.prepare(A).all(t,...a,r+1);if(b.length===0&&S.length===0)return{observations:[],sessions:[],prompts:[]};d=b.length>0?b[b.length-1].created_at_epoch:t,c=S.length>0?S[S.length-1].created_at_epoch:t}catch(b){return b instanceof Error?l.error("DB","Error getting boundary timestamps",{project:i},b):l.error("DB","Error getting boundary timestamps with non-Error",{},new Error(String(b))),{observations:[],sessions:[],prompts:[]}}}let u=`
      SELECT *
      FROM observations
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${o}
      ORDER BY created_at_epoch ASC
    `,g=`
      SELECT *
      FROM session_summaries
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${o}
      ORDER BY created_at_epoch ASC
    `,m=`
      SELECT up.*, s.project, s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.created_at_epoch >= ? AND up.created_at_epoch <= ? ${o.replace("project","s.project")}
      ORDER BY up.created_at_epoch ASC
    `,E=this.db.prepare(u).all(d,c,...a),f=this.db.prepare(g).all(d,c,...a),O=this.db.prepare(m).all(d,c,...a);return{observations:E,sessions:f.map(p=>({id:p.id,memory_session_id:p.memory_session_id,project:p.project,request:p.request,completed:p.completed,next_steps:p.next_steps,created_at:p.created_at,created_at_epoch:p.created_at_epoch})),prompts:O.map(p=>({id:p.id,content_session_id:p.content_session_id,prompt_number:p.prompt_number,prompt_text:p.prompt_text,project:p.project,created_at:p.created_at,created_at_epoch:p.created_at_epoch}))}}getPromptById(e){return this.db.prepare(`
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
    `).get(e)||null}getOrCreateManualSession(e){let t=`manual-${e}`,s=`manual-content-${e}`;if(this.db.prepare("SELECT memory_session_id FROM sdk_sessions WHERE memory_session_id = ?").get(t))return t;let i=new Date;return this.db.prepare(`
      INSERT INTO sdk_sessions (memory_session_id, content_session_id, project, platform_source, started_at, started_at_epoch, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(t,s,e,C,i.toISOString(),i.getTime()),l.info("SESSION","Created manual session",{memorySessionId:t,project:e}),t}close(){this.db.close()}importSdkSession(e){let t=this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e.content_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO sdk_sessions (
        content_session_id, memory_session_id, project, platform_source, user_prompt,
        started_at, started_at_epoch, completed_at, completed_at_epoch, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.content_session_id,e.memory_session_id,e.project,w(e.platform_source),e.user_prompt,e.started_at,e.started_at_epoch,e.completed_at,e.completed_at_epoch,e.status).lastInsertRowid}}importSessionSummary(e){let t=this.db.prepare("SELECT id FROM session_summaries WHERE memory_session_id = ?").get(e.memory_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
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
    `).run(e.memory_session_id,e.project,e.text,e.type,e.title,e.subtitle,e.facts,e.narrative,e.concepts,e.files_read,e.files_modified,e.prompt_number,e.discovery_tokens||0,e.agent_type??null,e.agent_id??null,e.created_at,e.created_at_epoch).lastInsertRowid}}fetchObservationForEnrichment(e){let t=this.db.prepare("SELECT type, title, subtitle, narrative, facts, files_read, files_modified, agent_type FROM observations WHERE id = ?").get(e);if(!t)return null;let s=r=>{if(!r)return[];try{let i=JSON.parse(r);return Array.isArray(i)?i:[]}catch{return[]}};return{type:t.type,title:t.title,subtitle:t.subtitle,narrative:t.narrative,facts:s(t.facts),files_read:s(t.files_read),files_modified:s(t.files_modified),agent_type:t.agent_type}}updateObservationDevWorkflowMetadata(e,t){let s=this.db.prepare("SELECT metadata FROM observations WHERE id = ?").get(e);if(!s)return;let r={};if(s.metadata)try{let o=JSON.parse(s.metadata);o&&typeof o=="object"&&!Array.isArray(o)&&(r=o)}catch{}let i={...r,dev_workflow:t};this.db.prepare("UPDATE observations SET metadata = ? WHERE id = ?").run(JSON.stringify(i),e)}updateObservationMetadataPatch(e,t){let s=this.db.prepare("SELECT metadata FROM observations WHERE id = ?").get(e);if(!s){l.warn("TRAINING",`updateObservationMetadataPatch: no observation id=${e}`);return}let r={};if(s.metadata)try{let o=JSON.parse(s.metadata);o&&typeof o=="object"&&!Array.isArray(o)&&(r=o)}catch{}let i={...r,...t};this.db.prepare("UPDATE observations SET metadata = ? WHERE id = ?").run(JSON.stringify(i),e)}upsertSessionRecord(e){let t=Date.now(),s=new Date(t).toISOString();this.db.prepare(`INSERT INTO session_records (
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
    `).run(e.content_session_id,e.prompt_number,e.prompt_text,e.created_at,e.created_at_epoch).lastInsertRowid}}};var L=require("fs"),P=require("path"),ge=require("os"),Z=class{static DEFAULTS={CLAUDE_MEM_MODEL:"claude-haiku-4-5-20251001",CLAUDE_MEM_CONTEXT_OBSERVATIONS:"50",CLAUDE_MEM_WORKER_PORT:String(37700+(process.getuid?.()??77)%100),CLAUDE_MEM_WORKER_HOST:"127.0.0.1",CLAUDE_MEM_SKIP_TOOLS:"ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion",CLAUDE_MEM_PROVIDER:"claude",CLAUDE_MEM_CLAUDE_AUTH_METHOD:"subscription",CLAUDE_MEM_GEMINI_API_KEY:"",CLAUDE_MEM_GEMINI_MODEL:"gemini-2.5-flash-lite",CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED:"true",CLAUDE_MEM_GEMINI_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_GEMINI_MAX_TOKENS:"100000",CLAUDE_MEM_OPENROUTER_API_KEY:"",CLAUDE_MEM_OPENROUTER_MODEL:"xiaomi/mimo-v2-flash:free",CLAUDE_MEM_OPENROUTER_SITE_URL:"",CLAUDE_MEM_OPENROUTER_APP_NAME:"claude-mem",CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_OPENROUTER_MAX_TOKENS:"100000",CLAUDE_MEM_DATA_DIR:(0,P.join)((0,ge.homedir)(),".claude-mem"),CLAUDE_MEM_LOG_LEVEL:"INFO",CLAUDE_MEM_PYTHON_VERSION:"3.13",CLAUDE_CODE_PATH:"",CLAUDE_MEM_MODE:"code",CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT:"true",CLAUDE_MEM_CONTEXT_FULL_COUNT:"0",CLAUDE_MEM_CONTEXT_FULL_FIELD:"narrative",CLAUDE_MEM_CONTEXT_SESSION_COUNT:"10",CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY:"true",CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE:"false",CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT:"true",CLAUDE_MEM_DIGEST_GROUP:"session",CLAUDE_MEM_DIGEST_WINDOW_DAYS:"7",CLAUDE_MEM_DIGEST_MAX_BLOCKS:"10",CLAUDE_MEM_DIGEST_FILES_PER_BLOCK:"4",CLAUDE_MEM_DIGEST_DESCRIBE:"true",CLAUDE_MEM_CONTEXT_GRANULARITY:"auto",CLAUDE_MEM_CONTEXT_RECENT_SESSIONS:"5",CLAUDE_MEM_WELCOME_HINT_ENABLED:"true",CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED:"false",CLAUDE_MEM_FOLDER_USE_LOCAL_MD:"false",CLAUDE_MEM_TRANSCRIPTS_ENABLED:"true",CLAUDE_MEM_TRANSCRIPTS_CONFIG_PATH:(0,P.join)((0,ge.homedir)(),".claude-mem","transcript-watch.json"),CLAUDE_MEM_CODEX_TRANSCRIPT_INGESTION:"false",CLAUDE_MEM_MAX_CONCURRENT_AGENTS:"2",CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD:"3",CLAUDE_MEM_EXCLUDED_PROJECTS:"",CLAUDE_MEM_FOLDER_MD_EXCLUDE:"[]",CLAUDE_MEM_SEMANTIC_INJECT:"false",CLAUDE_MEM_SEMANTIC_INJECT_LIMIT:"5",CLAUDE_MEM_TIER_ROUTING_ENABLED:"true",CLAUDE_MEM_TIER_SIMPLE_MODEL:"haiku",CLAUDE_MEM_TIER_SUMMARY_MODEL:"",CLAUDE_MEM_CHROMA_ENABLED:"true",CLAUDE_MEM_CHROMA_MODE:"local",CLAUDE_MEM_CHROMA_HOST:"127.0.0.1",CLAUDE_MEM_CHROMA_PORT:"8000",CLAUDE_MEM_CHROMA_SSL:"false",CLAUDE_MEM_CHROMA_API_KEY:"",CLAUDE_MEM_CHROMA_TENANT:"default_tenant",CLAUDE_MEM_CHROMA_DATABASE:"default_database",CLAUDE_MEM_TELEGRAM_ENABLED:"true",CLAUDE_MEM_TELEGRAM_BOT_TOKEN:"",CLAUDE_MEM_TELEGRAM_CHAT_ID:"",CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES:"security_alert",CLAUDE_MEM_TELEGRAM_TRIGGER_CONCEPTS:"",CLAUDE_MEM_QUEUE_ENGINE:"sqlite",CLAUDE_MEM_REDIS_URL:"",CLAUDE_MEM_REDIS_HOST:"127.0.0.1",CLAUDE_MEM_REDIS_PORT:"6379",CLAUDE_MEM_REDIS_MODE:"external",CLAUDE_MEM_QUEUE_REDIS_PREFIX:`claude_mem_${process.env.CLAUDE_MEM_WORKER_PORT??String(37700+(process.getuid?.()??77)%100)}`,CLAUDE_MEM_AUTH_MODE:"api-key",CLAUDE_MEM_RUNTIME:"worker",CLAUDE_MEM_SERVER_BETA_URL:`http://127.0.0.1:${process.env.CLAUDE_MEM_SERVER_PORT??String(37877+(process.getuid?.()??77)%100)}`,CLAUDE_MEM_SERVER_BETA_API_KEY:"",CLAUDE_MEM_SERVER_BETA_PROJECT_ID:""};static getAllDefaults(){return{...this.DEFAULTS}}static get(e){return process.env[e]??this.DEFAULTS[e]}static getInt(e){let t=this.get(e);return parseInt(t,10)}static getBool(e){let t=this.get(e);return t==="true"||t===!0}static applyEnvOverrides(e){let t={...e};for(let s of Object.keys(this.DEFAULTS))process.env[s]!==void 0&&(t[s]=process.env[s]);return t}static loadFromFile(e){try{if(!(0,L.existsSync)(e)){let o=this.getAllDefaults();try{let a=(0,P.dirname)(e);(0,L.existsSync)(a)||(0,L.mkdirSync)(a,{recursive:!0}),(0,L.writeFileSync)(e,JSON.stringify(o,null,2),"utf-8"),console.log("[SETTINGS] Created settings file with defaults:",e)}catch(a){console.warn("[SETTINGS] Failed to create settings file, using in-memory defaults:",e,a instanceof Error?a.message:String(a))}return this.applyEnvOverrides(o)}let t=(0,L.readFileSync)(e,"utf-8"),s=JSON.parse(t),r=s;if(s.env&&typeof s.env=="object"){r=s.env;try{(0,L.writeFileSync)(e,JSON.stringify(r,null,2),"utf-8"),console.log("[SETTINGS] Migrated settings file from nested to flat schema:",e)}catch(o){console.warn("[SETTINGS] Failed to auto-migrate settings file:",e,o instanceof Error?o.message:String(o))}}let i={...this.DEFAULTS};for(let o of Object.keys(this.DEFAULTS))r[o]!==void 0&&(i[o]=r[o]);return this.applyEnvOverrides(i)}catch(t){return console.warn("[SETTINGS] Failed to load settings, using defaults:",e,t instanceof Error?t.message:String(t)),this.applyEnvOverrides(this.getAllDefaults())}}};var j=require("fs"),ee=require("path");var I=class n{static instance=null;activeMode=null;modesDir;constructor(){let e=Pe(),t=[(0,ee.join)(e,"modes"),(0,ee.join)(e,"..","plugin","modes")],s=t.find(r=>(0,j.existsSync)(r));this.modesDir=s||t[0]}static getInstance(){return n.instance||(n.instance=new n),n.instance}parseInheritance(e){let t=e.split("--");if(t.length===1)return{hasParent:!1,parentId:"",overrideId:""};if(t.length>2)throw new Error(`Invalid mode inheritance: ${e}. Only one level of inheritance supported (parent--override)`);return{hasParent:!0,parentId:t[0],overrideId:e}}isPlainObject(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}deepMerge(e,t){let s={...e};for(let r in t){let i=t[r],o=e[r];this.isPlainObject(i)&&this.isPlainObject(o)?s[r]=this.deepMerge(o,i):s[r]=i}return s}loadModeFile(e){let t=(0,ee.join)(this.modesDir,`${e}.json`);if(!(0,j.existsSync)(t))throw new Error(`Mode file not found: ${t}`);let s=(0,j.readFileSync)(t,"utf-8");return JSON.parse(s)}loadMode(e){let t=this.parseInheritance(e);if(!t.hasParent)try{let d=this.loadModeFile(e);return this.activeMode=d,l.debug("SYSTEM",`Loaded mode: ${d.name} (${e})`,void 0,{types:d.observation_types.map(c=>c.id),concepts:d.observation_concepts.map(c=>c.id)}),d}catch(d){if(d instanceof Error?l.warn("WORKER",`Mode file not found: ${e}, falling back to 'code'`,{message:d.message}):l.warn("WORKER",`Mode file not found: ${e}, falling back to 'code'`,{error:String(d)}),e==="code")throw new Error("Critical: code.json mode file missing");return this.loadMode("code")}let{parentId:s,overrideId:r}=t,i;try{i=this.loadMode(s)}catch(d){d instanceof Error?l.warn("WORKER",`Parent mode '${s}' not found for ${e}, falling back to 'code'`,{message:d.message}):l.warn("WORKER",`Parent mode '${s}' not found for ${e}, falling back to 'code'`,{error:String(d)}),i=this.loadMode("code")}let o;try{o=this.loadModeFile(r),l.debug("SYSTEM",`Loaded override file: ${r} for parent ${s}`)}catch(d){return d instanceof Error?l.warn("WORKER",`Override file '${r}' not found, using parent mode '${s}' only`,{message:d.message}):l.warn("WORKER",`Override file '${r}' not found, using parent mode '${s}' only`,{error:String(d)}),this.activeMode=i,i}if(!o)return l.warn("SYSTEM",`Invalid override file: ${r}, using parent mode '${s}' only`),this.activeMode=i,i;let a=this.deepMerge(i,o);return this.activeMode=a,l.debug("SYSTEM",`Loaded mode with inheritance: ${a.name} (${e} = ${s} + ${r})`,void 0,{parent:s,override:r,types:a.observation_types.map(d=>d.id),concepts:a.observation_concepts.map(d=>d.id)}),a}getActiveMode(){if(!this.activeMode)throw new Error("No mode loaded. Call loadMode() first.");return this.activeMode}getObservationTypes(){return this.getActiveMode().observation_types}getObservationConcepts(){return this.getActiveMode().observation_concepts}getTypeIcon(e){return this.getObservationTypes().find(s=>s.id===e)?.emoji||"\u{1F4DD}"}getWorkEmoji(e){return this.getObservationTypes().find(s=>s.id===e)?.work_emoji||"\u{1F4DD}"}validateType(e){return this.getObservationTypes().some(t=>t.id===e)}getTypeLabel(e){return this.getObservationTypes().find(s=>s.id===e)?.label||e}};function Te(){let n=$.settings(),e=Z.loadFromFile(n),t=I.getInstance().getActiveMode(),s=new Set(t.observation_types.map(i=>i.id)),r=new Set(t.observation_concepts.map(i=>i.id));return{totalObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_OBSERVATIONS,10),fullObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_FULL_COUNT,10),sessionCount:parseInt(e.CLAUDE_MEM_CONTEXT_SESSION_COUNT,10),showReadTokens:e.CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS==="true",showWorkTokens:e.CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS==="true",showSavingsAmount:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT==="true",showSavingsPercent:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT==="true",observationTypes:s,observationConcepts:r,fullObservationField:e.CLAUDE_MEM_CONTEXT_FULL_FIELD,showLastSummary:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY==="true",showLastMessage:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE==="true",digestGroup:Ts(e.CLAUDE_MEM_DIGEST_GROUP),digestWindowDays:parseInt(e.CLAUDE_MEM_DIGEST_WINDOW_DAYS,10),digestMaxBlocks:parseInt(e.CLAUDE_MEM_DIGEST_MAX_BLOCKS,10),digestFilesPerBlock:parseInt(e.CLAUDE_MEM_DIGEST_FILES_PER_BLOCK,10),digestDescribe:e.CLAUDE_MEM_DIGEST_DESCRIBE!=="false",granularity:fs(e.CLAUDE_MEM_CONTEXT_GRANULARITY),recentSessionCount:parseInt(e.CLAUDE_MEM_CONTEXT_RECENT_SESSIONS,10)||5}}function Ts(n){return n==="topic"||n==="flat"?n:"session"}function fs(n){return n==="pointers"||n==="mutations"||n==="observations"?n:"auto"}var _={reset:"\x1B[0m",bright:"\x1B[1m",dim:"\x1B[2m",cyan:"\x1B[36m",green:"\x1B[32m",yellow:"\x1B[33m",blue:"\x1B[34m",magenta:"\x1B[35m",gray:"\x1B[90m",red:"\x1B[31m"},We=4,fe=1;function Se(n){let e=(n.title?.length||0)+(n.subtitle?.length||0)+(n.narrative?.length||0)+JSON.stringify(n.facts||[]).length;return Math.ceil(e/We)}function he(n){let e=n.length,t=n.reduce((o,a)=>o+Se(a),0),s=n.reduce((o,a)=>o+(a.discovery_tokens||0),0),r=s-t,i=s>0?Math.round(r/s*100):0;return{totalObservations:e,totalReadTokens:t,totalDiscoveryTokens:s,savings:r,savingsPercent:i}}function Ss(n){return I.getInstance().getWorkEmoji(n)}function G(n,e){let t=Se(n),s=n.discovery_tokens||0,r=Ss(n.type),i=s>0?`${r} ${s.toLocaleString()}`:"-";return{readTokens:t,discoveryTokens:s,discoveryDisplay:i,workEmoji:r}}function te(n){return n.showReadTokens||n.showWorkTokens||n.showSavingsAmount||n.showSavingsPercent}var Ve=k(require("path"),1),se=require("fs");var hs=["private","claude-mem-context","system_instruction","system-instruction","persisted-output","system-reminder"],nr=new RegExp(`<(${hs.join("|")})\\b[^>]*>[\\s\\S]*?</\\1>`,"g"),Ye=/<system-reminder>[\s\S]*?<\/system-reminder>/g;var bs=["task-notification"],rr=new RegExp(`^\\s*<(${bs.join("|")})\\b[^>]*>(?:(?!<\\1\\b|</\\1\\b)[\\s\\S])*</\\1>\\s*$`),ir=256*1024;function be(n,e,t){let s=Array.from(t.observationTypes),r=s.map(()=>"?").join(","),i=Array.from(t.observationConcepts),o=i.map(()=>"?").join(",");return n.db.prepare(`
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
        WHERE value IN (${o})
      )
    ORDER BY o.created_at_epoch DESC
    LIMIT ?
  `).all(e,e,...s,...i,t.totalObservationCount)}function Oe(n,e,t){return n.db.prepare(`
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
  `).all(e,e,t.sessionCount+fe)}function Ke(n,e,t){let s=Array.from(t.observationTypes),r=s.map(()=>"?").join(","),i=Array.from(t.observationConcepts),o=i.map(()=>"?").join(","),a=e.map(()=>"?").join(",");return n.db.prepare(`
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
        WHERE value IN (${o})
      )
    ORDER BY o.created_at_epoch DESC
    LIMIT ?
  `).all(...e,...e,...s,...i,t.totalObservationCount)}function qe(n,e,t){let s=e.map(()=>"?").join(",");return n.db.prepare(`
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
  `).all(...e,...e,t.sessionCount+fe)}function Os(n){return n.replace(/\//g,"-")}function Rs(n){if(!n.includes('"type":"assistant"'))return null;let e=JSON.parse(n);if(e.type==="assistant"&&e.message?.content&&Array.isArray(e.message.content)){let t="";for(let s of e.message.content)s.type==="text"&&(t+=s.text);if(t=t.replace(Ye,"").trim(),t)return t}return null}function As(n){for(let e=n.length-1;e>=0;e--)try{let t=Rs(n[e]);if(t)return t}catch(t){t instanceof Error?l.debug("WORKER","Skipping malformed transcript line",{lineIndex:e},t):l.debug("WORKER","Skipping malformed transcript line",{lineIndex:e,error:String(t)});continue}return""}function Ns(n){try{if(!(0,se.existsSync)(n))return{userMessage:"",assistantMessage:""};let e=(0,se.readFileSync)(n,"utf-8").trim();if(!e)return{userMessage:"",assistantMessage:""};let t=e.split(`
`).filter(r=>r.trim());return{userMessage:"",assistantMessage:As(t)}}catch(e){return e instanceof Error?l.failure("WORKER","Failed to extract prior messages from transcript",{transcriptPath:n},e):l.warn("WORKER","Failed to extract prior messages from transcript",{transcriptPath:n,error:String(e)}),{userMessage:"",assistantMessage:""}}}function Re(n,e,t,s){if(!e.showLastMessage||n.length===0)return{userMessage:"",assistantMessage:""};let r=n.find(d=>d.memory_session_id!==t);if(!r)return{userMessage:"",assistantMessage:""};let i=r.memory_session_id,o=Os(s),a=Ve.default.join(U,"projects",o,`${i}.jsonl`);return Ns(a)}function Je(n,e){let t=e[0]?.id;return n.map((s,r)=>{let i=r===0?null:e[r+1];return{...s,displayEpoch:i?i.created_at_epoch:s.created_at_epoch,displayTime:i?i.created_at:s.created_at,shouldShowLink:s.id!==t}})}function Ae(n,e){let t=[...n.map(s=>({type:"observation",data:s})),...e.map(s=>({type:"summary",data:s}))];return t.sort((s,r)=>{let i=s.type==="observation"?s.data.created_at_epoch:s.data.displayEpoch,o=r.type==="observation"?r.data.created_at_epoch:r.data.displayEpoch;return i-o}),t}function Qe(n,e){return new Set(n.slice(0,e).map(t=>t.id))}var Cs={group:"session",windowDays:7,maxBlocks:10,filesPerBlock:4,scanLimit:2e3,describe:!0};function ze(n){if(!n)return"";let e=n.split(`
`)[0];return e=e.replace(/^\/Volumes\/[^/]+\/code\/(monorepo|ai)\//,"").replace(/^.*\/\.claude\/plugins\/[^/]+\//,"").replace(/^\/Volumes\/HD\/code\//,""),e.length>70&&(e="\u2026"+e.slice(-69)),e}function Ze(n){if(!n)return!1;let e=n.split(`
`)[0];return!(!e.includes("/")||/^\s*(cd|git|npm|pnpm|bun|node|echo|cat)\s/.test(e)||/[;|&]|2>&1|\$\(|<<|\bgrep\b|\becho\b/.test(e))}function Is(n){return n.startsWith("mcp__")?(n.split("__").pop()??n)||"external":n}function Ds(n){if(!n)return"";let e=n.split(`
`)[0];if(Ze(e)){let t=e.replace(/\/+$/,"").split("/").pop()??e;return t.length>0?t:ze(e)}return e.length>48?e.slice(0,47)+"\u2026":e}function et(n){if(!n)return"";let e=n.split(`
`)[0],t=e.match(/([^/]+)\/\.claude\/worktrees\/([^/]+)/);return t?`${t[1]}/${t[2]}`:(t=e.match(/_specs\/([^/]+)/),t?`_specs/${t[1]}`:(t=e.match(/\.claude\/(?:skills|plugins|agents)\/([^/]+)/),t?`.claude/${t[1]}`:(t=e.match(/\/code\/(?:monorepo|ai)\/([^/]+)/)??e.match(/\/code\/([^/]+)\//),t&&t[1]!==".claude"&&t[1]!=="monorepo"&&t[1]!=="ai"?t[1]:"")))}function ne(n){return new Date(n).toISOString().slice(0,10)}function Ne(n){return new Date(n).toISOString().slice(5,10)}function tt(n){let e=new Set,t=[];for(let s of n){let r=Is(s.verb??s.tool_name.toLowerCase());e.has(r)||(e.add(r),t.push(r))}return t}function st(n,e){let t=new Set,s=[],r=n.filter(o=>Ze(o.target)),i=r.length>0?r:n.filter(o=>o.target);for(let o of i){let a=Ds(o.target);!a||t.has(a)||(t.add(a),s.push(a))}return{shown:s.slice(0,e),extra:Math.max(0,s.length-e)}}function Ls(n){let e=new Map;for(let r of n){let i=et(r.target);i&&e.set(i,(e.get(i)??0)+1)}if(e.size===0)return{label:"misc",otherAreas:0};let t="",s=-1;for(let[r,i]of e)i>s&&(t=r,s=i);return{label:t,otherAreas:e.size-1}}function Ms(n,e,t){let s=e.map(()=>"?").join(","),r=t.nowEpoch??Date.now(),i=[...e],o=`project IN (${s})`;return t.windowDays>0&&(o+=" AND created_at_epoch >= ?",i.push(r-t.windowDays*864e5)),i.push(t.scanLimit),n.prepare(`SELECT tool_name, target, verb, content_session_id, created_at_epoch
       FROM mutations
       WHERE ${o}
       ORDER BY created_at_epoch DESC
       LIMIT ?`).all(...i)}function ys(n,e=100){let t=n.replace(/\s+/g," ").trim();return t.length>e?t.slice(0,e-1).trimEnd()+"\u2026":t}function vs(n){let e=n.split(`
`)[0],t;do t=e,e=e.replace(/^@"[^"]*"\s*/,"").replace(/^@\S+\s+/,"").replace(/^\/[a-z0-9:_-]+\s+/i,"").trimStart();while(e!==t);return e.trim()}function Us(n,e){let t=new Map;if(e.length===0)return t;let s=e.map(()=>"?").join(",");try{let r=n.prepare(`SELECT sk.content_session_id AS csid,
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
         WHERE sk.content_session_id IN (${s})`).all(...e);for(let i of r){let o=i.custom_title?.trim()||""||i.completed?.trim()||""||i.request?.trim()||""||i.user_prompt?.trim()||"";o&&t.set(i.csid,ys(vs(o)))}}catch{}return t}function ws(n,e){let t=["## Recent changes (durable mutations)",""],s="",r=new Set,i=0;for(let o of n){if(i>=e.maxBlocks)break;let a=ne(o.created_at_epoch);a!==s&&(t.push(`### ${a}`),s=a,r.clear());let d=o.verb??o.tool_name.toLowerCase(),c=ze(o.target),u=`${d}::${c}`;r.has(u)||(r.add(u),t.push(`- ${d}: ${c||"(external)"}`),i++)}return t.push(""),t}function xs(n,e,t){let s=new Map;for(let d of e){let c=s.get(d.content_session_id);c?c.push(d):s.set(d.content_session_id,[d])}let r=[...s.values()].map(d=>({csid:d[0].content_session_id,rs:d,latest:d[0].created_at_epoch})).sort((d,c)=>c.latest-d.latest).slice(0,t.maxBlocks),i=t.describe?Us(n,r.map(d=>d.csid)):new Map,o=["## Recent work (by session)",""],a="";for(let{csid:d,rs:c,latest:u}of r){let g=ne(u);g!==a&&(o.push(`### ${g}`),a=g);let{label:m,otherAreas:E}=Ls(c),f=tt(c).join(", "),O=E>0?` +${E} area${E>1?"s":""}`:"",p=`${c.length} change${c.length>1?"s":""} (${f})${O}`,{shown:A,extra:b}=st(c,t.filesPerBlock),S=b>0?` +${b} more`:"",h=A.length>0?A.join(", ")+S:"",N=i.get(d);if(N){o.push(`- ${m}: ${N}`);let Y=h?`${p} \xB7 ${h}`:p;o.push(`  ${Y}`)}else o.push(`- ${m} \u2014 ${p}`),h&&o.push(`  ${h}`)}return o.push(""),o}function ks(n,e){let t=new Map;for(let o of n){let a=et(o.target)||"misc",d=t.get(a);d?d.push(o):t.set(a,[o])}let s=[...t.entries()].map(([o,a])=>({label:o,rs:a,latest:a[0].created_at_epoch})).sort((o,a)=>a.rs.length-o.rs.length||a.latest-o.latest).slice(0,e.maxBlocks),i=[`## Recent changes by area${e.windowDays>0?` (last ${e.windowDays} days)`:""}`,""];for(let{label:o,rs:a}of s){let d=tt(a).join(", "),c=a[0].created_at_epoch,u=a[a.length-1].created_at_epoch,g=ne(c)===ne(u)?Ne(c):`${Ne(u)}\u2192${Ne(c)}`;i.push(`- ${o} \u2014 ${a.length} change${a.length>1?"s":""} \xB7 ${d} \xB7 ${g}`);let{shown:m,extra:E}=st(a,e.filesPerBlock);if(m.length>0){let f=E>0?` +${E} more`:"";i.push(`  ${m.join(", ")}${f}`)}}return i.push(""),i}function nt(n,e,t={}){if(e.length===0)return[];let s={...Cs,...t},r=Ms(n,e,s);if(r.length===0)return[];switch(s.group){case"flat":return ws(r,s);case"topic":return ks(r,s);default:return xs(n,r,s)}}function rt(){let n=new Date,e=n.toLocaleDateString("en-CA"),t=n.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=n.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function it(n){return[`# [${n}] recent context, ${rt()}`,""]}function ot(){return[`Legend: \u{1F3AF}session ${I.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji}${t.id}`).join(" ")}`,"Format: ID TIME TYPE TITLE","Fetch details: get_observations([IDs]) | Search: mem-search skill",""]}function at(){return[]}function dt(){return[]}function ct(n,e){let t=[],s=[`${n.totalObservations} obs (${n.totalReadTokens.toLocaleString()}t read)`,`${n.totalDiscoveryTokens.toLocaleString()}t work`];return n.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)&&(e.showSavingsPercent?s.push(`${n.savingsPercent}% savings`):e.showSavingsAmount&&s.push(`${n.savings.toLocaleString()}t saved`)),t.push(`Stats: ${s.join(" | ")}`),t.push(""),t}function ut(n){return[`### ${n}`]}function _t(n){return n.toLowerCase().replace(" am","a").replace(" pm","p")}function lt(n,e,t){let s=n.title||"Untitled",r=I.getInstance().getTypeIcon(n.type),i=e?_t(e):'"';return`${n.id} ${i} ${r} ${s}`}function pt(n,e,t,s){let r=[],i=n.title||"Untitled",o=I.getInstance().getTypeIcon(n.type),a=e?_t(e):'"',{readTokens:d,discoveryDisplay:c}=G(n,s);r.push(`**${n.id}** ${a} ${o} **${i}**`),t&&r.push(t);let u=[];return s.showReadTokens&&u.push(`~${d}t`),s.showWorkTokens&&u.push(c),u.length>0&&r.push(u.join(" ")),r.push(""),r}function mt(n,e){return[`S${n.id} ${n.request||"Session started"} (${e})`]}function H(n,e){return e?[`**${n}**: ${e}`,""]:[]}function Et(n){return n.assistantMessage?["","---","","**Previously**","",`A: ${n.assistantMessage}`,""]:[]}function gt(n,e){return["",`Access ${Math.round(n/1e3)}k tokens of past work via get_observations([IDs]) or mem-search skill.`]}function Tt(n){return`# [${n}] recent context, ${rt()}

No previous sessions found.`}function ft(){let n=new Date,e=n.toLocaleDateString("en-CA"),t=n.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=n.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function St(n){return["",`${_.bright}${_.cyan}[${n}] recent context, ${ft()}${_.reset}`,`${_.gray}${"\u2500".repeat(60)}${_.reset}`,""]}function ht(){let e=I.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji} ${t.id}`).join(" | ");return[`${_.dim}Legend: session-request | ${e}${_.reset}`,""]}function bt(){return[`${_.bright}Column Key${_.reset}`,`${_.dim}  Read: Tokens to read this observation (cost to learn it now)${_.reset}`,`${_.dim}  Work: Tokens spent on work that produced this record ( research, building, deciding)${_.reset}`,""]}function Ot(){return[`${_.dim}Context Index: This semantic index (titles, types, files, tokens) is usually sufficient to understand past work.${_.reset}`,"",`${_.dim}When you need implementation details, rationale, or debugging context:${_.reset}`,`${_.dim}  - Fetch by ID: get_observations([IDs]) for observations visible in this index${_.reset}`,`${_.dim}  - Search history: Use the mem-search skill for past decisions, bugs, and deeper research${_.reset}`,`${_.dim}  - Trust this index over re-reading code for past decisions and learnings${_.reset}`,""]}function Rt(n,e){let t=[];if(t.push(`${_.bright}${_.cyan}Context Economics${_.reset}`),t.push(`${_.dim}  Loading: ${n.totalObservations} observations (${n.totalReadTokens.toLocaleString()} tokens to read)${_.reset}`),t.push(`${_.dim}  Work investment: ${n.totalDiscoveryTokens.toLocaleString()} tokens spent on research, building, and decisions${_.reset}`),n.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)){let s="  Your savings: ";e.showSavingsAmount&&e.showSavingsPercent?s+=`${n.savings.toLocaleString()} tokens (${n.savingsPercent}% reduction from reuse)`:e.showSavingsAmount?s+=`${n.savings.toLocaleString()} tokens`:s+=`${n.savingsPercent}% reduction from reuse`,t.push(`${_.green}${s}${_.reset}`)}return t.push(""),t}function At(n){return[`${_.bright}${_.cyan}${n}${_.reset}`,""]}function Nt(n){return[`${_.dim}${n}${_.reset}`]}function Ct(n,e,t,s){let r=n.title||"Untitled",i=I.getInstance().getTypeIcon(n.type),{readTokens:o,discoveryTokens:a,workEmoji:d}=G(n,s),c=t?`${_.dim}${e}${_.reset}`:" ".repeat(e.length),u=s.showReadTokens&&o>0?`${_.dim}(~${o}t)${_.reset}`:"",g=s.showWorkTokens&&a>0?`${_.dim}(${d} ${a.toLocaleString()}t)${_.reset}`:"";return`  ${_.dim}#${n.id}${_.reset}  ${c}  ${i}  ${r} ${u} ${g}`}function It(n,e,t,s,r){let i=[],o=n.title||"Untitled",a=I.getInstance().getTypeIcon(n.type),{readTokens:d,discoveryTokens:c,workEmoji:u}=G(n,r),g=t?`${_.dim}${e}${_.reset}`:" ".repeat(e.length),m=r.showReadTokens&&d>0?`${_.dim}(~${d}t)${_.reset}`:"",E=r.showWorkTokens&&c>0?`${_.dim}(${u} ${c.toLocaleString()}t)${_.reset}`:"";return i.push(`  ${_.dim}#${n.id}${_.reset}  ${g}  ${a}  ${_.bright}${o}${_.reset}`),s&&i.push(`    ${_.dim}${s}${_.reset}`),(m||E)&&i.push(`    ${m} ${E}`),i.push(""),i}function Dt(n,e){let t=`${n.request||"Session started"} (${e})`;return[`${_.yellow}#S${n.id}${_.reset} ${t}`,""]}function X(n,e,t){return e?[`${t}${n}:${_.reset} ${e}`,""]:[]}function Lt(n){return n.assistantMessage?["","---","",`${_.bright}${_.magenta}Previously${_.reset}`,"",`${_.dim}A: ${n.assistantMessage}${_.reset}`,""]:[]}function Mt(n,e){let t=Math.round(n/1e3);return["",`${_.dim}Access ${t}k tokens of past research & decisions for just ${e.toLocaleString()}t. Use the claude-mem skill to access memories by ID.${_.reset}`]}function yt(n){return`
${_.bright}${_.cyan}[${n}] recent context, ${ft()}${_.reset}
${_.gray}${"\u2500".repeat(60)}${_.reset}

${_.dim}No previous sessions found for this project yet.${_.reset}
`}function vt(n,e,t,s){let r=[];return s?r.push(...St(n)):r.push(...it(n)),s?r.push(...ht()):r.push(...ot()),s?r.push(...bt()):r.push(...at()),s?r.push(...Ot()):r.push(...dt()),te(t)&&(s?r.push(...Rt(e,t)):r.push(...ct(e,t))),r}var Ce=k(require("path"),1);function oe(n){if(!n)return[];try{let e=JSON.parse(n);return Array.isArray(e)?e:[]}catch(e){return l.debug("PARSER","Failed to parse JSON array, using empty fallback",{preview:n?.substring(0,50)},e instanceof Error?e:new Error(String(e))),[]}}function Ie(n){return new Date(n).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:!0})}function De(n){return new Date(n).toLocaleString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})}function wt(n){return new Date(n).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric"})}function Ut(n,e){return Ce.default.isAbsolute(n)?Ce.default.relative(e,n):n}function xt(n,e,t){let s=oe(n);if(s.length>0)return Ut(s[0],e);if(t){let r=oe(t);if(r.length>0)return Ut(r[0],e)}return"General"}function $s(n){let e=new Map;for(let s of n){let r=s.type==="observation"?s.data.created_at:s.data.displayTime,i=wt(r);e.has(i)||e.set(i,[]),e.get(i).push(s)}let t=Array.from(e.entries()).sort((s,r)=>{let i=new Date(s[0]).getTime(),o=new Date(r[0]).getTime();return i-o});return new Map(t)}function kt(n,e){return e.fullObservationField==="narrative"?n.narrative:n.facts?oe(n.facts).join(`
`):null}function Fs(n,e,t,s){let r=[];r.push(...ut(n));let i="";for(let o of e)if(o.type==="summary"){let a=o.data,d=Ie(a.displayTime);r.push(...mt(a,d))}else{let a=o.data,d=De(a.created_at),u=d!==i?d:"";if(i=d,t.has(a.id)){let m=kt(a,s);r.push(...pt(a,u,m,s))}else r.push(lt(a,u,s))}return r}function Ps(n,e,t,s,r){let i=[];i.push(...At(n));let o=null,a="";for(let d of e)if(d.type==="summary"){o=null,a="";let c=d.data,u=Ie(c.displayTime);i.push(...Dt(c,u))}else{let c=d.data,u=xt(c.files_modified,r,c.files_read),g=De(c.created_at),m=g!==a;a=g;let E=t.has(c.id);if(u!==o&&(i.push(...Nt(u)),o=u),E){let f=kt(c,s);i.push(...It(c,g,m,f,s))}else i.push(Ct(c,g,m,s))}return i.push(""),i}function js(n,e,t,s,r,i){return i?Ps(n,e,t,s,r):Fs(n,e,t,s)}function $t(n,e,t,s,r){let i=[],o=$s(n);for(let[a,d]of o)i.push(...js(a,d,e,t,s,r));return i}function Ft(n,e,t){return!(!n.showLastSummary||!e||!!!(e.investigated||e.learned||e.completed||e.next_steps)||t&&e.created_at_epoch<=t.created_at_epoch)}function Pt(n,e){let t=[];return e?(t.push(...X("Investigated",n.investigated,_.blue)),t.push(...X("Learned",n.learned,_.yellow)),t.push(...X("Completed",n.completed,_.green)),t.push(...X("Next Steps",n.next_steps,_.magenta))):(t.push(...H("Investigated",n.investigated)),t.push(...H("Learned",n.learned)),t.push(...H("Completed",n.completed)),t.push(...H("Next Steps",n.next_steps))),t}function jt(n,e){return e?Lt(n):Et(n)}function Gt(n,e,t){return!te(e)||n.totalDiscoveryTokens<=0||n.savings<=0?[]:t?Mt(n.totalDiscoveryTokens,n.totalReadTokens):gt(n.totalDiscoveryTokens,n.totalReadTokens)}var D=require("fs"),y=require("path"),Le=require("os");function Gs(n){return n&&(n==="~"||n.startsWith("~/")?n.replace(/^~/,(0,Le.homedir)()):n)}function Hs(){if(process.env.CLAUDE_MEM_DATA_DIR)return process.env.CLAUDE_MEM_DATA_DIR;let n=(0,y.join)((0,Le.homedir)(),".claude-mem"),e=(0,y.join)(n,"settings.json");try{if((0,D.existsSync)(e)){let t=JSON.parse((0,D.readFileSync)(e,"utf-8")),s=t.env??t;if(s.CLAUDE_MEM_DATA_DIR)return s.CLAUDE_MEM_DATA_DIR}}catch{}return n}function Xs(n){let e=le(n),t=J(n);return t.isWorktree&&t.parentProjectName?`${t.parentProjectName}/${e}`:e}function B(n,e){if(!n)return;let t=Gs(n);return(0,y.isAbsolute)(t)?t:(0,y.resolve)(e,t)}function Ht(n){let e=n,t=Xs(e),s=(0,y.join)(Hs(),"settings.json"),r={};try{(0,D.existsSync)(s)&&(r=JSON.parse((0,D.readFileSync)(s,"utf-8")))}catch{}let i=r?.projects?.[t],o=!!i&&Object.keys(i).length>0,a={configured:o,projectKey:t,projectRoot:e};return o&&(a.sessionsDir=B(i.sessionsDir,e),a.specsDirs=Array.isArray(i.specsDirs)?i.specsDirs.map(d=>B(d,e)).filter(Boolean):[],a.memoryDir=B(i.memoryDir,e),a.wikiDir=B(i.wikiDir,e),a.currentSessionFile=B(i.currentSessionFile,e),a.projectTags=Array.isArray(i.projectTags)?i.projectTags:[]),a}function Xt(n,e){if(!n||!(0,D.existsSync)(n))return[];try{let t=(0,D.readdirSync)(n,{withFileTypes:!0}),s=[];for(let r of t){if(!r.isFile()||!r.name.endsWith(".md"))continue;let i=(0,y.join)(n,r.name);try{let o=(0,D.statSync)(i);s.push({path:i,basename:r.name,mtimeMs:o.mtimeMs})}catch{}}return s.sort((r,i)=>i.mtimeMs-r.mtimeMs),s.slice(0,Math.max(0,e))}catch{return[]}}var x=require("path"),W=require("fs"),Bs=/^##\s+(Next Steps|Next steps|TODO|Follow-?ups?)\s*$/i,Ws=/^##\s/,Ys=/^---+\s*$/,Vs=/^###\s/,ae=8,Bt=/^---\s*$/,Ks=/^#\s+(.+?)\s*$/,qs=/^([a-zA-Z_-]+)\s*:\s*(.*)$/,Wt={completed:"\u2705",done:"\u2705",shipped:"\u2705",closed:"\u2705","in-progress":"\u{1F7E3}",in_progress:"\u{1F7E3}",wip:"\u{1F7E3}",ongoing:"\u{1F7E3}",active:"\u{1F7E3}",planning:"\u{1F535}",planned:"\u{1F535}",exploring:"\u{1F535}",research:"\u{1F535}",bug:"\u{1F534}",bugfix:"\u{1F534}",blocked:"\u{1F534}",failed:"\u{1F534}",notes:"\u{1F4DD}",doc:"\u{1F4DD}",docs:"\u{1F4DD}","release-notes":"\u{1F4DD}"};function Js(n,e){if(n){let s=n.toLowerCase().trim().replace(/\s+/g,"-");if(Wt[s])return Wt[s]}let t=e.toLowerCase();return t.includes("release-note")||t.includes("release_note")?"\u{1F4DD}":t.includes("bug")||t.includes("fix-")||t.includes("-fix")?"\u{1F534}":t.includes("audit")||t.includes("analysis")?"\u{1F535}":"\u{1F7E3}"}function Qs(n){let e=n.getHours(),t=n.getMinutes(),s=e<12?"a":"p";return e=e%12,e===0&&(e=12),`${String(e).padStart(2," ")}:${String(t).padStart(2,"0")}${s}`}var zs=/(\d{2}:\d{2}(?::\d{2})?)/,Zs=/^\d{4}-\d{2}-\d{2}[T ](\d{2}:\d{2})/,en=/^\d{4}-\d{2}-\d{2}-?/,Yt=/\[([^\]]+)\]/,tn=/^([A-Za-z]{1,4}-?\d{1,5}|p\d{1,4}|[A-Z]{2,6}-\d+)\s*[—:\-]\s*(.+)$/,sn=100;function nn(n){let e=Yt.exec(n);return e?e[1].split(",").map(t=>t.trim()).filter(Boolean):[]}function rn(n){let e=new Set,t=[];for(let s of n){let r=s.toLowerCase();e.has(r)||(e.add(r),t.push(s))}return t}function on(n,e){return n.length<=e?n:n.slice(0,e-1).replace(/\s+\S*$/,"")+"\u2026"}function an(n){try{let t=(0,W.readFileSync)(n,"utf-8").split(`
`,80),s={},r=0;if(t[0]&&Bt.test(t[0])){for(r=1;r<t.length&&!Bt.test(t[r]);){let i=qs.exec(t[r]);if(i){let o=i[1].toLowerCase(),a=i[2].trim().replace(/^\[|\]$/g,"").replace(/^["']|["']$/g,"").trim();["title","project","feature","story","issue","status","tags","topics","date","time","started_at","updated_at","last_updated","ended_at","finished_at"].includes(o)&&(s[o]=a)}r++}r++}if(!s.title)for(let i=r;i<t.length;i++){let o=Ks.exec(t[i]);if(o){s.title=o[1].trim();break}if(t[i].trim()&&!t[i].startsWith("#"))break}return s}catch{return{}}}function dn(n,e){let t=rn([...nn(e),...n.tags?n.tags.split(",").map(a=>a.trim()):[],...n.project?[n.project]:[]]).filter(Boolean).slice(0,3),s=n.title;s||(s=e.replace(/\.md$/,"").replace(en,"").replace(Yt,"").replace(/^-+|-+$/g,"").replace(/-/g," ").trim());let r=n.issue||n.story||n.feature,i=s;if(!r){let a=tn.exec(s);a&&(r=a[1],i=a[2].trim())}let o=[];return t.length&&o.push(`[${t.slice(0,4).join(",")}]`),r&&o.push(r),o.push(i),n.status&&o.push(`(${n.status})`),on(o.join(" "),sn)}function cn(n){return`${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][n.getMonth()]} ${n.getDate()}, ${n.getFullYear()}`}function un(n,e){let t=[n.started_at,n.last_updated,n.updated_at,n.finished_at,n.ended_at,n.date].filter(Boolean);for(let r of t)if(Zs.test(r)){let i=new Date(r);if(!isNaN(i.getTime()))return i}let s=/^(\d{4}-\d{2}-\d{2})/.exec(e.basename);if(s){let r=s[1],i=n.time&&zs.exec(n.time);if(i){let d=new Date(`${r}T${i[1].length===5?i[1]+":00":i[1]}`);if(!isNaN(d.getTime()))return d}let o=new Date(e.mtimeMs),a=new Date(`${r}T${String(o.getHours()).padStart(2,"0")}:${String(o.getMinutes()).padStart(2,"0")}:00`);if(!isNaN(a.getTime()))return a}return new Date(e.mtimeMs)}function _n(n){let e=n.map(i=>{let o=an(i.path),a=un(o,i);return{dayKey:a.toISOString().slice(0,10),dayLabel:cn(a),epochMs:a.getTime(),timeLabel:Qs(a),emoji:Js(o.status,i.basename),description:dn(o,i.basename)}}),t=new Map;for(let i of e)t.has(i.dayKey)||t.set(i.dayKey,[]),t.get(i.dayKey).push(i);let s=[...t.keys()].sort().reverse(),r=[];for(let i of s){let o=t.get(i).sort((a,d)=>a.epochMs-d.epochMs);r.push(`### ${o[0].dayLabel}`);for(let a of o){let d=a.timeLabel.padStart(6," ");r.push(`${d}  ${a.emoji}  ${a.description}`)}r.push("")}for(;r.length&&!r[r.length-1];)r.pop();return r}function ln(n){try{let t=(0,W.readFileSync)(n,"utf-8").split(`
`),s=-1;for(let i=0;i<t.length;i++)Bs.test(t[i])&&(s=i+1);if(s<0)return"";let r=[];for(let i=s;i<t.length;i++){let o=t[i];if(Ws.test(o)||Vs.test(o)||Ys.test(o)||(r.push(o),r.length>=ae+4))break}for(;r.length&&!r[r.length-1].trim();)r.pop();if(r.length>ae){let i=r.slice(0,ae);return i.push(`_(+${r.length-ae} more \u2014 see file)_`),i.join(`
`).trim()}return r.join(`
`).trim()}catch{return""}}function Vt(n,e,t,s){let r=[];if(r.push(`# [${n}] recent context, ${new Date().toISOString().slice(0,16).replace("T"," ")}`,""),r.push("claude-mem-pro routes recall to project artifacts (sessions, specs, memory, CLAUDE.md).","Below are pointers \u2014 read on demand via the `recall` skill or directly with Read.",""),t.currentSessionFile&&(0,W.existsSync)(t.currentSessionFile)&&(r.push("## Current session"),r.push(`- ${(0,x.relative)(e,t.currentSessionFile)}`),r.push("")),s.length>0){let i=t.sessionsDir?(0,x.relative)(e,t.sessionsDir):"";r.push(`## Recent sessions${i?` \u2014 \`${i}/\``:""}`),r.push(..._n(s)),r.push("");let o=ln(s[0].path);o&&(r.push("## Carry-over from last session"),r.push(o),r.push(""))}else t.sessionsDir&&(r.push("## Sessions"),r.push(`- ${(0,x.relative)(e,t.sessionsDir)}/ (empty)`),r.push(""));if(t.specsDirs&&t.specsDirs.length>0){r.push("## Specs");for(let i of t.specsDirs)r.push(`- ${(0,x.relative)(e,i)}/`);r.push("")}return t.memoryDir&&(r.push("## Memory"),r.push(`- ${(0,x.relative)(e,t.memoryDir)}/`),r.push("")),t.projectTags&&t.projectTags.length>0&&r.push(`Tags: ${t.projectTags.join(", ")}`,""),r.push("For deeper recall use the `recall` skill or `mem-search`."),r.join(`
`).trimEnd()}var pn=Kt.default.join((0,qt.homedir)(),".claude","plugins","marketplaces","cafesean","plugin",".install-version");function mn(){try{return new z}catch(n){if(n instanceof Error&&n.code==="ERR_DLOPEN_FAILED"){try{(0,Jt.unlinkSync)(pn)}catch(e){e instanceof Error?l.debug("WORKER","Marker file cleanup failed (may not exist)",{},e):l.debug("WORKER","Marker file cleanup failed (may not exist)",{error:String(e)})}return l.error("WORKER","Native module rebuild needed - restart Claude Code to auto-fix"),null}throw n}}function En(n,e){return e?yt(n):Tt(n)}function Qt(){return process.env.CLAUDE_MEM_INJECT_MODE==="legacy"?"legacy":"mutations"}function Me(n,e){return Number.isFinite(n)?n:e}function gn(n,e,t,s,r,i,o,a,d){let c=[],u=s.granularity??"auto";if(u==="pointers"||u==="auto"){let h=Ht(r);if(h.configured||u==="pointers"){let N=Xt(h.sessionsDir,s.recentSessionCount);return Vt(n,r,h,N)}}if(u==="mutations"||u!=="observations"&&Qt()==="mutations"){c.push(`# [${n}] recent context, ${new Date().toISOString().slice(0,16).replace("T"," ")}`,"");let h=[];try{h=nt(a.db,d,{group:s.digestGroup,windowDays:Me(s.digestWindowDays,7),maxBlocks:Me(s.digestMaxBlocks,10),filesPerBlock:Me(s.digestFilesPerBlock,4),describe:s.digestDescribe})}catch(N){l.warn("CONTEXT","mutation digest failed, falling back to legacy",{error:N instanceof Error?N.message:String(N)}),h=[]}if(h.length>0)return c.push(...h),c.push("For deeper recall (past decisions, lessons, specs, session history), use the `recall` skill or `mem-search`."),c.join(`
`).trimEnd();c.length=0}let m=he(e);c.push(...vt(n,m,s,o));let E=t.slice(0,s.sessionCount),f=Je(E,t),O=Ae(e,f),p=Qe(e,s.fullObservationCount);c.push(...$t(O,p,s,r,o));let A=t[0],b=e[0];Ft(s,A,b)&&c.push(...Pt(A,o));let S=Re(e,s,i,r);return c.push(...jt(S,o)),c.push(...Gt(m,s,o)),c.join(`
`).trimEnd()}async function ye(n,e=!1){let t=Te(),s=n?.cwd??process.cwd(),r=pe(s),i=n?.projects?.length?n.projects:r.allProjects,o=i[i.length-1]??r.primary;n?.full&&(t.totalObservationCount=999999,t.sessionCount=999999);let a=mn();if(!a)return"";try{let d=i.length>1?Ke(a,i,t):be(a,o,t),c=i.length>1?qe(a,i,t):Oe(a,o,t);return Qt()==="legacy"&&d.length===0&&c.length===0?En(o,e):gn(o,d,c,t,s,n?.session_id,e,a,i)}finally{a.close()}}0&&(module.exports={generateContext});
