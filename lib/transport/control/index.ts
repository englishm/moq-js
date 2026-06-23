import { Subscribe, GroupOrder, FilterType, SubscriptionFilter } from "./subscribe"
import { SubscribeOk } from "./subscribe_ok"
import { SubscribeUpdate } from "./subscribe_update"
import { SubscribeNamespace, SubscribeOptions } from "./subscribe_namespace"
import { Unsubscribe } from "./unsubscribe"
import { Publish } from "./publish"
import { PublishOk } from "./publish_ok"
import { PublishDone } from "./publish_done"
import { PublishNamespace } from "./publish_namespace"
import { PublishNamespaceDone } from "./publish_namespace_done"
import { PublishNamespaceCancel } from "./publish_namespace_cancel"
import { Namespace } from "./namespace"
import { NamespaceDone } from "./namespace_done"
import { TrackStatus } from "./track_status"
import { Fetch } from "./fetch"
import { FetchOk } from "./fetch_ok"
import { FetchCancel } from "./fetch_cancel"
import { GoAway } from "./go_away"
import { ClientSetup } from "./client_setup"
import { ServerSetup } from "./server_setup"
import { RequestOk } from "./request_ok"
import { RequestError } from "./request_error"
import { MaxRequestId } from "./max_request_id"
import { RequestsBlocked } from "./requests_blocked"
import { ControlMessageType } from "./message_type"

// Discriminated union where data type matches the control message type
type MessageWithType =
	| { type: ControlMessageType.Publish; message: Publish }
	| { type: ControlMessageType.PublishOk; message: PublishOk }
	| { type: ControlMessageType.PublishDone; message: PublishDone }
	| { type: ControlMessageType.PublishNamespace; message: PublishNamespace }
	| { type: ControlMessageType.PublishNamespaceDone; message: PublishNamespaceDone }
	| { type: ControlMessageType.PublishNamespaceCancel; message: PublishNamespaceCancel }
	| { type: ControlMessageType.Namespace; message: Namespace }
	| { type: ControlMessageType.NamespaceDone; message: NamespaceDone }
	| { type: ControlMessageType.TrackStatus; message: TrackStatus }
	| { type: ControlMessageType.Fetch; message: Fetch }
	| { type: ControlMessageType.FetchOk; message: FetchOk }
	| { type: ControlMessageType.FetchCancel; message: FetchCancel }
	| { type: ControlMessageType.Subscribe; message: Subscribe }
	| { type: ControlMessageType.SubscribeOk; message: SubscribeOk }
	| { type: ControlMessageType.SubscribeUpdate; message: SubscribeUpdate }
	| { type: ControlMessageType.SubscribeNamespace; message: SubscribeNamespace }
	| { type: ControlMessageType.Unsubscribe; message: Unsubscribe }
	| { type: ControlMessageType.RequestOk; message: RequestOk }
	| { type: ControlMessageType.RequestError; message: RequestError }
	| { type: ControlMessageType.MaxRequestId; message: MaxRequestId }
	| { type: ControlMessageType.RequestsBlocked; message: RequestsBlocked }
	| { type: ControlMessageType.GoAway; message: GoAway }

type Message = Subscriber | Publisher | GoAway

// Sent by subscriber
type Subscriber =
	| Subscribe
	| SubscribeUpdate
	| SubscribeNamespace
	| Unsubscribe
	| PublishOk
	| Fetch
	| FetchCancel
	| PublishNamespaceCancel
	| TrackStatus
	| MaxRequestId
	| RequestsBlocked
	| RequestOk
	| RequestError

// Sent by publisher
type Publisher =
	| SubscribeOk
	| PublishDone
	| Publish
	| PublishNamespace
	| PublishNamespaceDone
	| Namespace
	| NamespaceDone
	| FetchOk
	| MaxRequestId
	| RequestsBlocked
	| RequestOk
	| RequestError

function isSubscriber(m: ControlMessageType): boolean {
	return (
		m == ControlMessageType.Subscribe ||
		m == ControlMessageType.SubscribeUpdate ||
		m == ControlMessageType.Unsubscribe ||
		m == ControlMessageType.PublishOk ||
		m == ControlMessageType.PublishNamespaceCancel ||
		m == ControlMessageType.TrackStatus ||
		m == ControlMessageType.MaxRequestId ||
		m == ControlMessageType.RequestsBlocked ||
		m == ControlMessageType.RequestOk ||
		m == ControlMessageType.RequestError
	)
}

function isPublisher(m: ControlMessageType): boolean {
	return (
		m == ControlMessageType.SubscribeOk ||
		m == ControlMessageType.PublishDone ||
		m == ControlMessageType.Publish ||
		m == ControlMessageType.PublishNamespace ||
		m == ControlMessageType.PublishNamespaceDone ||
		m == ControlMessageType.Namespace ||
		m == ControlMessageType.NamespaceDone ||
		m == ControlMessageType.MaxRequestId ||
		m == ControlMessageType.RequestsBlocked ||
		m == ControlMessageType.RequestOk ||
		m == ControlMessageType.RequestError
	)
}

export { ControlMessageType, Version } from "./message_type"

export {
	Subscribe,
	SubscribeOk,
	SubscribeUpdate,
	SubscribeNamespace,
	SubscribeOptions,
	Unsubscribe,
	Publish,
	PublishOk,
	PublishDone,
	PublishNamespace,
	PublishNamespaceDone,
	PublishNamespaceCancel,
	Namespace,
	NamespaceDone,
	TrackStatus,
	Fetch,
	FetchOk,
	FetchCancel,
	GoAway,
	ClientSetup,
	ServerSetup,
	MaxRequestId,
	RequestsBlocked,
	RequestOk,
	RequestError,
	isSubscriber,
	isPublisher,
	MessageWithType,
	Message,
	GroupOrder,
	FilterType,
	SubscriptionFilter,
}
