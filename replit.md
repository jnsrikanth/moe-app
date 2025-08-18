# MoE (Mixture of Experts) System Dashboard

## Overview

This is a full-stack web application that provides a real-time monitoring dashboard for a Mixture of Experts (MoE) AI system. The application simulates expert agents for credit scoring, fraud detection, and ESG analysis, with a central router that manages request routing and load balancing. The dashboard displays real-time metrics, system logs, and agent performance data through an interactive web interface.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack React Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Communication**: WebSocket connection for live updates

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with WebSocket support for real-time features
- **Development Server**: Vite integration for hot module replacement in development
- **Error Handling**: Centralized error middleware with structured error responses

### Data Storage Solutions
- **Primary Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **In-Memory Storage**: Fallback MemStorage implementation for development/demo purposes
- **Session Management**: PostgreSQL-based session storage using connect-pg-simple

### Real-time Features
- **WebSocket Server**: Integrated WebSocket server for real-time dashboard updates
- **Message Types**: Structured message system for different data types (agent updates, metrics, logs)
- **Connection Management**: Automatic reconnection logic with exponential backoff

### Component Organization
- **Shared Schema**: Zod schemas in `/shared` directory for type safety across client and server
- **Component Structure**: Modular React components for different dashboard sections
- **Custom Hooks**: Reusable hooks for WebSocket management and mobile detection
- **UI System**: Comprehensive design system with consistent theming

### Development Workflow
- **Build Process**: Separate build steps for client (Vite) and server (esbuild)
- **Type Checking**: Strict TypeScript configuration with path mapping
- **Hot Reload**: Vite HMR integration with Express server
- **Environment Management**: Development and production environment configurations

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting
- **Drizzle Kit**: Database migration and schema management tools

### UI and Styling
- **Radix UI**: Headless component primitives for accessibility
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library for consistent iconography
- **Class Variance Authority**: Component variant management

### Development Tools
- **Vite**: Fast build tool and development server
- **esbuild**: JavaScript bundler for production builds
- **TSX**: TypeScript execution engine for development

### Real-time Communication
- **WebSocket (ws)**: WebSocket server implementation
- **TanStack React Query**: Server state management with caching

### Additional Libraries
- **Zod**: Runtime type validation and schema definition
- **date-fns**: Date manipulation and formatting
- **Wouter**: Lightweight React router
- **React Hook Form**: Form state management with validation