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
        router: false
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

    let dependencies = ["vercel", "vclight"];
    let devDependencies = ["@vercel/node"];

    if (template.router) {
        dependencies[dependencies.length] = "vclight-router";
    }

    let success = false;

    new Promise(resolve => {
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
            // write package.json
            fs.writeFileSync(name + "/package.json", JSON.stringify(packageJson, null, 2));

            fs.writeFileSync(name + "/vercel.json", JSON.stringify({
                builds: [
                    {
                        src: "src/*",
                        use: "@vercel/node"
                    }
                ],
                routes: [
                    {
                        src: "/(.*)",
                        dest: "src/main.ts"
                    }
                ]
            }, null, 2));

            if (pluginsChosen.includes(keys.prettier)) {
                fs.writeFileSync(name + "/.prettierrc.json", JSON.stringify({
                    printWidth: 100,
                    trailingComma: "none",
                    tabWidth: 4
                }, null, 2));


                fs.writeFileSync(name + "/.prettierignore", "/.idea\n" +
                    "/node_modules\n" +
                    "/vercel\n" +
                    ".env\n" +
                    "package-lock.json\n" +
                    "yarn.lock\n" +
                    ".vercel\n");
            }

            fs.mkdirSync(name + "/src");
//${template.router ? "import router from \"./app/router\"\n;" : ""}
            //${template.router ? "app.use(router)\n;" : ""}
            fs.writeFileSync(name + "/src/main.ts", "import VCLight from \"vclight\";\n" +
                (template.router ? "import router from \"./app/router\";\n" : "") +
                "import { VercelRequest, VercelResponse } from \"@vercel/node\";\n" +
                "\n" +
                "module.exports = async function(request:VercelRequest, response:VercelResponse) {\n" +
                "    const app = new VCLight();\n" +
                (template.router ? "    app.use(router);\n" : "") +
                "    await app.fetch(request, response);\n" +
                "};\n");

            fs.writeFileSync(name + "/.prettierignore", "/.idea\n" +
                "/node_modules\n" +
                "/vercel\n" +
                ".env\n" +
                "package-lock.json\n" +
                "yarn.lock\n" +
                ".vercel\n");

            if (template.router) {
                fs.mkdirSync(name + "/src/app");
                fs.mkdirSync(name + "/src/app/routers");
                fs.writeFileSync(name + "/src/app/router.ts", "import VCLightRouter from \"vclight-router\";\n" +
                    "\n" +
                    "const router = new VCLightRouter();\n" +
                    "export default router;\n" +
                    "import \"./routers/index\"\n" +
                    "import \"./routers/favicon\"\n");
                fs.writeFileSync(name + "/src/app/routers/index.ts", "import router from \"../router\";\n" +
                    "import { readFileSync } from \"fs\";\n" +
                    "\n" +
                    "router.on(\"/\", async function(data, response) {\n" +
                    "    response.contentType = \"text/html\";\n" +
                    "    response.response = readFileSync(process.cwd() + \"/public/index.html\");\n" +
                    "})");
                fs.writeFileSync(name + "/src/app/routers/favicon.ts", "import router from \"../router\";\n" +
                    "import { readFileSync } from \"fs\";\n" +
                    "\n" +
                    "router.on(\"/favicon.ico\", async function(data, response) {\n" +
                    "    response.contentType = \"image/x-icon\";\n" +
                    "    response.response = readFileSync(process.cwd() + \"/public/favicon.ico\");\n" +
                    "})");

                fs.mkdirSync(name + "/public");
                fs.writeFileSync(name + "/public/index.html", fs.readFileSync(`${__dirname}/../files/index.html`));
                fs.writeFileSync(name + "/public/favicon.ico", fs.readFileSync(`${__dirname}/../files/favicon.ico`));

            }
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