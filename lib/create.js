const inquirer = require("inquirer");
const chalk = require("chalk");
const logSymbols = require("log-symbols");
const fs = require("fs");
const keys = {
    router: "A template project with VCLight and router",
    blank: "A blank project with VCLight",
    prettier: "Prettier"
};
const getPackageVersion = require("./getPackageVersion");
const ora = require("ora");
const path = require("path");
const ejs = require("ejs");

function isValidFolderName(str) {
    const illegalChars = /[<>:"/\\|?*\x00-\x1F]/g;
    if (str.match(illegalChars)) {
        return false;
    }
    if (str.trim() === "") {
        return false;
    }
    return str.length <= 255;

}

function toValidNpmName(str) {
    str = str.replace(/\s+/g, "-");
    str = str.replace(/[^a-zA-Z0-9-]/g, "");
    str = str.toLowerCase();
    return str;
}

function readDirAll(url, index) {
    let result = {
        path: url,
        title: path.basename(url),
        extname: "",
        deep: index,
        type: "directory",
        child: []
    };
    const res = fs.readdirSync(url);
    res.map(item => {
        const subPath = path.join(url, item);//文件相对路径
        const isDirectory = fs.statSync(subPath).isDirectory(); //是否是文件夹
        const extname = path.extname(item); //文件后缀
        if (isDirectory) { //递归继续读 过滤文件夹
            result.child.push(readDirAll(subPath, index + 1));
        }
        if (!isDirectory) { //过滤文件后缀，文件名
            result.child.push({
                path: subPath,
                title: path.basename(subPath),
                type: "file",
                deep: index + 1,
                extname
            });
        }
    });
    return result;
}

async function writeFile(fileName, data) {
    await fs.writeFile(fileName, data, async (err) => {
        if (err) {
            if (err.code === "ENOENT") {
                // 文件或路径不存在，需要创建
                const dirs = fileName.split("/").slice(0, -1);
                let currentDir = "";
                dirs.forEach((dir) => {
                    currentDir += `${dir}/`;
                    if (!fs.existsSync(currentDir)) {
                        fs.mkdirSync(currentDir);
                    }
                });
                // 重新写入文件
                await writeFile(fileName, data);
            } else {
                console.error(err);
            }
        }
    });
}

async function writeFromTemplate(dirTree, to, template) {
    for (const dirTreeElement of dirTree) {
        if (dirTreeElement.type === "file") {
            const dir = dirTreeElement.path.split(path.sep).slice(-dirTreeElement.deep).join("/");
            if (dirTreeElement.extname === ".ejs") {
                ejs.renderFile(dirTreeElement.path, { template }, {}, function(err, str) {
                    if (str) {
                        writeFile(to + "/" + dir.slice(0, -dirTreeElement.extname.length), str);
                    }
                });
            } else {
                await writeFile(to + "/" + dir, fs.readFileSync(dirTreeElement.path));
            }
        } else {
            await writeFromTemplate(dirTreeElement.child, to, template);
        }
    }
}

module.exports = async function(name) {
    if (!isValidFolderName(name)) {
        console.log(chalk.red(logSymbols.error), chalk.red(`${name} can't be the name of a project, please retry.`));
        return;
    }
    console.log(logSymbols.info, "Creating project", chalk.cyan(name));
    let question = [{
        type: "list",
        name: "template",
        message: "Which template would you like to use?",
        choices: [keys.router, keys.blank]
    },
        {
            type: "checkbox",
            name: "plugins",
            message: "Which plugins would you like to use?",
            choices: [keys.prettier]
        }
    ];

    let templateChosen, pluginsChosen;

    await inquirer.prompt(question).then((answers) => {
        templateChosen = answers["template"];
        pluginsChosen = answers["plugins"];
    });

    let template = {
        router: false,
        prettier: false
    };

    if (templateChosen === keys.router) {
        template.router = true;
    }

    console.log(`✨  Creating project.`);

    const spinner = ora("Creating Files...").start();

    try {
        fs.mkdirSync(name);
    } catch {
        spinner.stop();
        console.log(logSymbols.error, chalk.red("Can't create project folder, check if a project with the same name exists."));
        return;
    }

    let dependencies = ["vclight","vercel"];
    let dependenciesWithVersion = {};
    let devDependenciesWithVersion = {};
    let devDependencies = ["@vercel/node"];

    if (template.router) {
        dependencies[dependencies.length] = "vclight-router";
    }

    new Promise(() => {
        setTimeout(async () => {
            let packageJson = {
                name: toValidNpmName(name),
                version: "0.1.0",
                private: true,
                scripts: {
                    serve: "vercel dev"
                },
                dependencies: {},
                devDependencies: {}
            };
            let taskList = [];
            for (const dependency of dependencies) {
                taskList[taskList.length] = getPackageVersion(dependency)
                    .then((r) => packageJson.dependencies[dependency] = "^" + r);
            }
            for (const devDependency of devDependencies) {
                taskList[taskList.length] = getPackageVersion(devDependency)
                    .then((r) => packageJson.devDependencies[devDependency] = "^" + r);
            }
            await Promise.all(taskList);
            for (const dependency in dependenciesWithVersion) {
                packageJson.dependencies[dependency]=dependenciesWithVersion[dependency]
            }
            for (const dependency in devDependenciesWithVersion) {
                packageJson.devDependencies[dependency]=devDependenciesWithVersion[dependency]
            }
            // write package.json
            fs.writeFileSync(name + "/package.json", JSON.stringify(packageJson, null, 2));

            if (pluginsChosen.includes(keys.prettier)) {
                template.prettier = true;
            }

            await writeFromTemplate(readDirAll(__dirname + "/../files/", 0).child, name, template);

            spinner.stop();
            console.log(logSymbols.success, chalk.green("Created successfully."), "\n");
            console.log("run commands:");
            console.log(chalk.green("cd " + name));
            console.log(chalk.green("npm install"));
        }, 1000);
    }).catch((e) => {
        spinner.stop();
        console.log(logSymbols.error, chalk.red("Can't create files."));
        console.log(e);
    });
};