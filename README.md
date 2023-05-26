# srp

### 事前準備
```
export REGION='******'
export SECRETS_MANAGER_ID='******'
export USERNAME='******'
export PASSWORD='******'
```

### 動作する
```
rm -rf ./node_modules && npm install && npx tsc && node dist/index.js
```

### 動作しない
```
rm -rf ./node_modules && npm install && npx tsc && http-server
```
