import type {VmState,VmSource} from './vm'
export type SubscriptionChat={tutor_subject_id?:string|null;tutor_retired?:boolean;id:string;provider_url?:string|null;provider_snapshot?:import('./chatSync').ChatMirror|null;title:string;is_main:boolean;pinned:boolean;archived:boolean;deleted_at:string|null;created_at:string;updated_at:string}
export type SubscriptionMessage={id:string;role:'user'|'assistant';content:string;created_at:string}
export type SubscriptionWorkspace={chat:SubscriptionChat;chats:SubscriptionChat[];messages:SubscriptionMessage[];hasOlder:boolean;google:VmState['google'];sources:VmSource[];connection:{provider:'chatgpt-subscription';connected:false;state:'setup_required';message:string}}
