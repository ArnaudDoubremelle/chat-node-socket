# Chat

## Setup

Install/node_modules/

```bash
$ yarn install
```

Launch nodejs
```bash
$ yarn start
```

## Events

### Server

**chat.join**

```json
{
    "username": "John Doe"
}
```

**chat.message**

```json
{
    "username": "John Doe",
    "message": "Lorem ipsum..."
}
```

**chat.message**

### Client

**chat.join**

```json
{
    "username": "John Doe"
}
```

**chat.message**

```json
{
    "message": "Lorem ipsum..."
}
```