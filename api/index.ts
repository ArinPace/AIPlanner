import { handleCloudRequest } from '../server/cloud.js'
export function GET(request: Request) { return handleCloudRequest(request) }
export function POST(request: Request) { return handleCloudRequest(request) }
export function PUT(request: Request) { return handleCloudRequest(request) }
export function DELETE(request: Request) { return handleCloudRequest(request) }

export function OPTIONS(request: Request) { return handleCloudRequest(request) }
