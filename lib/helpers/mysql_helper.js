const mysql = require('promise-mysql')

const params = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    charset: 'utf8mb4'
};

var connection;

console.log('sql params', params);

module.exports.getDBConnection = () => {
    return mysql.createConnection(params)
}

module.exports.queryDB = (sql_query, secure_params) => {
    var result = mysql.createConnection(params).then(function (conn) {
        var result = conn.query(sql_query, secure_params);
        conn.end();
        return result
    }).then(function (rows) {
        if (connection && connection.end) connection.end();


        // console.log(rows)
        return rows;
    }).catch(function (error) {
        console.log(error)
        if (connection && connection.end) connection.end();
    });
    return result;
}